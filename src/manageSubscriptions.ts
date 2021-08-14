import { preferences } from "nova-extension-utils"
import { activateLsp } from "./activateLsp"
import { registerFormatDocument } from "./commands/formatDocument"
import { keys, state, vars } from "./globalVars"

export async function cancelSubscriptions(
  subscriptions: CompositeDisposable | null
) {
  if (subscriptions) {
    subscriptions.dispose()
    subscriptions = null
  }
}

export async function addLspSubscriptions() {
  // Register format on save command
  if (state.client && state.lspSubscriptions) {
    state.lspSubscriptions.add(
      state.client.onDidStop(err => {
        let message = "Dart Language Server stopped unexpectedly"
        err ? message += `:\n\n${err.toString()}` : message += "."
        // TODO: show this in the top right corner and not as an alert
        nova.workspace.showActionPanel(
          message,
          { buttons: ["Restart", "Ignore"] },
          index => {
            if (index == 0) activateLsp(true)
          }
        )
      })
    )
    state.lspSubscriptions.add(registerFormatDocument(state.client))
  }
  startEditorSubscriptions()
}

function startEditorSubscriptions() {
  state.lspSubscriptions?.add(
    nova.workspace.onDidAddTextEditor(editor => {
      state.editorSubscriptions = new CompositeDisposable()
      state.lspSubscriptions?.add(state.editorSubscriptions)
      state.lspSubscriptions?.add(
        editor.onDidDestroy(() => {
          state.editorSubscriptions?.dispose()
          state.editorSubscriptions = null
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
      state.lspSubscriptions?.add({
        dispose() {
          willSaveListener?.dispose()
        }
      })
      const refreshListener = () => {
        willSaveListener?.dispose()
        willSaveListener = setupListener()
      }
      state.editorSubscriptions.add(editor.document.onDidChangeSyntax(refreshListener))
      state.editorSubscriptions.add(
        nova.config.onDidChange(keys.formatDocumentOnSave, refreshListener)
      )
      state.editorSubscriptions.add(
        nova.workspace.config.onDidChange(
          keys.formatDocumentOnSave,
          refreshListener
        )
      )
    })
  )
}
