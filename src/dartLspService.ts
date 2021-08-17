import { preferences } from "nova-extension-utils"
import { registerFormatDocument } from "./commands/formatDocument"
import { keys, state, vars } from "./globalVars"
import { info } from "./informationView"
import { cancelSubs } from "./manageSubscriptions"
import { findDartPath } from "./utils/findDart"
import { showActionableError } from "./utils/utils"

export class DartLanguageClient {
  languageClient: LanguageClient | null
  constructor() {
    this.languageClient = null
  }

  // start the language client
  async activate(active: boolean) {
    await this.deactivate()
    active ? console.log("Activating...") : console.log("Reloading...")
    active ? (info.status = "Activating...") : (info.status = "Reloading...")
    if (nova.inDevMode() && this.reload) {
      const notification = new NotificationRequest("activated")
      notification.body = "Dart LSP is loading"
      nova.notifications.add(notification)
    }
    state.lspSubs = new CompositeDisposable()
    let analyzerPath: string | null = null
    try {
      analyzerPath = await findDartPath()
    } catch (err) {
      console.error(err)
      throw new Error("Dart Analyzer not found.")
    }

    const analysisServer = `${analyzerPath
      ?.trim()
      .replace(
        "/bin/dart",
        "/bin/cache/dart-sdk/bin/snapshots"
      )}/analysis_server.dart.snapshot`
    console.log(`Analyzer path is: ${analysisServer}`)

    const serverOptions: ServerOptions = {
      type: "stdio",
      path: "/usr/bin/env",
      args: ["dart", `${analysisServer}`, "--lsp"]
    }

    const clientOptions = {
      initializationOptions: {
        onlyAnalyzeProjectsWithOpenFiles: true,
        suggestFromUnimportedLibraries: true,
        closingLabels: true,
        outline: true,
        flutterOutline: true
      },
      syntaxes: vars.syntaxes
    }

    this.languageClient = new LanguageClient(
      "sciencefidelity.dart",
      "Dart Language Server",
      serverOptions,
      clientOptions
    )
    try {
      this.languageClient.start()
    } catch (err) {
      console.error(err)
      throw new Error(err)
    }
    await this.subscribe()
    // TODO: Do something with the Flutter outline
    this.languageClient.onNotification(
      "dart/textDocument/publishFlutterOutline",
      notification => {
        vars.outline = notification
      }
    )
    console.log("LSP Running")
    info.status = "Running"
    info.reload()
  }

  // stop the language client
  async deactivate() {
    await cancelSubs(state.editorSubs)
    await cancelSubs(state.lspSubs)
    this.languageClient?.stop()
    info.status = "Inactive"
  }

  // reload the language client
  async reload() {
    await this.deactivate()
    // false means the LSP is not active when function is called
    this.activate(false)
  }

  // add disposables
  async subscribe() {

    // show alert if LSP crashes
    this.languageClient &&
      state.lspSubs?.add(
        this.languageClient.onDidStop((err: any) => {
          showActionableError(
            "analyzer-stopped",
            "Dart Language Server stopped unexpectedly,",
            (err && err.toString()) ||
              "if this problem persits please report it.",
            ["Restart", "Ignore"],
            (r: number) => {
              switch (r) {
                case 0:
                  this.activate(true)
                  break
              }
            }
          )
        })
      )

    // Register format on save command
    this.languageClient &&
      state.lspSubs?.add(registerFormatDocument(this.languageClient))
    this.startSubs()
  }

  startSubs() {
    state.lspSubs?.add(
      nova.workspace.onDidAddTextEditor(editor => {
        state.editorSubs = new CompositeDisposable()
        state.lspSubs?.add(state.editorSubs)
        state.lspSubs?.add(
          editor.onDidDestroy(() => {
            state.editorSubs?.dispose()
            state.editorSubs = null
          })
        )
        //prettier-ignore
        const setupListener = () => {
          if (!(vars.syntaxes as Array<string | null>)
            .includes(editor.document.syntax)) return

          const formatOnSave = preferences.getOverridableBoolean(
            keys.formatDocumentOnSave
          )
          if (!formatOnSave) return
          return editor.onWillSave(async editor => {
            await nova.commands.invoke(keys.formatDocument, editor)
          })
        }

        let willSaveListener = setupListener()
        state.lspSubs?.add({
          dispose() {
            willSaveListener?.dispose()
          }
        })
        const refreshListener = () => {
          willSaveListener?.dispose()
          willSaveListener = setupListener()
        }
        state.editorSubs.add(editor.document.onDidChangeSyntax(refreshListener))
        // prettier-ignore
        state.editorSubs.add(
          nova.config.onDidChange(
            keys.formatDocumentOnSave,
            refreshListener
          )
        )
        state.editorSubs.add(
          nova.workspace.config.onDidChange(
            keys.formatDocumentOnSave,
            refreshListener
          )
        )
      })
    )
  }
}
