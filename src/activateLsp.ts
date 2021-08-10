import { cleanPath, preferences } from "nova-extension-utils"
import { daemon } from "./startFlutterDaemon"
import { registerFormatDocument } from "./commands/formatDocument"
import { makeFileExecutable } from "./novaUtils"
import { informationView } from "./informationView"
import { compositeDisposable } from "./main"

export let client: LanguageClient | null = null
const formatOnSaveKey = "sciencefidelity.dart.config.formatDocumentOnSave"

export async function asyncActivate() {
  informationView.status = "Activating..."

  const runFile = nova.path.join(nova.extension.path, "run.sh")

  // Uploading to the extension library makes this file not executable
  await makeFileExecutable(runFile)

  let serviceArgs
  if (nova.inDevMode() && nova.workspace.path) {
    const logDir = nova.path.join(nova.workspace.path, "logs")
    await new Promise<void>((resolve, reject) => {
      const p = new Process("/usr/bin/env", {
        args: ["mkdir", "-p", logDir]
      })
      p.onDidExit(status => (status === 0 ? resolve() : reject()))
      p.start()
    })
    console.log("logging to", logDir)
    // passing inLog breaks some requests for an unknown reason
    // const inLog = nova.path.join(logDir, "languageServer-in.log");
    const outLog = nova.path.join(logDir, "languageServer-out.log")
    serviceArgs = {
      path: "/usr/bin/env",
      // args: ["bash", "-c", `tee "${inLog}" | "${runFile}" | tee "${outLog}"`],
      args: ["bash", "-c", `"${runFile}" | tee "${outLog}"`]
    }
  } else {
    serviceArgs = {
      path: runFile
    }
  }

  let path
  if (nova.inDevMode() && nova.workspace.path) {
    path = `${cleanPath(nova.workspace.path)}/test-workspace`
  } else if (nova.workspace.path) {
    path = cleanPath(nova.workspace.path)
  }

  const syntaxes = ["dart"]
  const clientOptions = {
    initializationOptions: {
      onlyAnalyzeProjectsWithOpenFiles: true,
      suggestFromUnimportedLibraries: true,
      closingLabels: true,
      outline: true,
      flutterOutline: true
    },
    syntaxes
  }

  client = new LanguageClient(
    "sciencefidelity.dart",
    "Dart Language Server",
    {
      type: "stdio",
      ...serviceArgs,
      env: {
        WORKSPACE_DIR: path || "",
        INSTALL_DIR:
          nova.config.get(
            "sciencefidelity.dart.config.analyzerPath",
            "string"
          ) || "~/flutter/bin/cache/dart-sdk/bin/snapshots"
      }
    },
    clientOptions
  )

  // Register format on save command
  compositeDisposable.add(registerFormatDocument(client))

  compositeDisposable.add(
    client.onDidStop(err => {
      let message = "Dart Language Server stopped unexpectedly"
      if (err) {
        message += `:\n\n${err.toString()}`
      } else {
        message += "."
      }
      message +=
        "\n\nPlease report this, along with any output in the Extension Console."
      nova.workspace.showActionPanel(
        message,
        {
          buttons: ["Restart", "Ignore"]
        },
        index => {
          if (index == 0) {
            nova.commands.invoke("sciencefidelity.dart.reload")
          }
        }
      )
    })
  )

  client.start()
  // client.onNotification(
  //   "dart/textDocument/publishFlutterOutline",
  //   notification => {
  //     console.log(JSON.stringify(notification))
  //   }
  // )

  compositeDisposable.add(
    nova.workspace.onDidAddTextEditor(editor => {
      const editorDisposable = new CompositeDisposable()
      compositeDisposable.add(editorDisposable)
      compositeDisposable.add(
        editor.onDidDestroy(() => {
          editorDisposable.dispose()
          daemon?.kill()
        })
      )

      // watch things that might change if this needs to happen or not
      editorDisposable.add(editor.document.onDidChangeSyntax(refreshListener))
      editorDisposable.add(
        nova.config.onDidChange(formatOnSaveKey, refreshListener)
      )
      editorDisposable.add(
        nova.workspace.config.onDidChange(formatOnSaveKey, refreshListener)
      )

      let willSaveListener = setupListener()
      compositeDisposable.add({
        dispose() {
          willSaveListener?.dispose()
        }
      })

      function refreshListener() {
        // willSaveListener?.dispose()
        willSaveListener = setupListener()
      }

      function setupListener() {
        if (
          !(syntaxes as Array<string | null>).includes(editor.document.syntax)
        ) {
          return
        }
        const formatDocumentOnSave =
          preferences.getOverridableBoolean(formatOnSaveKey)
        if (!formatDocumentOnSave) {
          return
        }
        return editor.onWillSave(async editor => {
          if (formatDocumentOnSave) {
            await nova.commands.invoke(
              "sciencefidelity.dart.commands.formatDocument",
              editor
            )
          }
        })
      }
    })
  )

  informationView.status = "Running"
  informationView.reload()
}
