import { wrapCommand } from "../utils/utils"
import { keys } from "../globalVars"

export function registerGetDependencies() {
  return nova.commands.register(
    keys.getDependencies,
    wrapCommand(getDependencies)
  )
}

// Fetch dependencies
// eslint-disable-next-line no-unused-vars
function getDependencies() {
  return new Promise<void>((resolve, reject) => {
    console.log("Getting dependencies")
    let cwd = nova.workspace.path!
    if (nova.inDevMode()) {
      cwd = nova.path.join(nova.workspace.path!, "test-workspace")
    }
    const process = new Process("/usr/bin/env", {
      args: ["flutter", "pub", "get"],
      cwd: cwd,
      stdio: ["ignore", "pipe", "pipe"]
    })
    process.onStdout(line => {
      const dependencySuccessNotification = new NotificationRequest(
        "dependencies"
      )
      dependencySuccessNotification.body = line.trim()
      nova.notifications.add(dependencySuccessNotification)
      console.log(line)
    })
    process.onStderr(line => {
      const dependencyErrorNotification = new NotificationRequest(
        "dependencies"
      )
      dependencyErrorNotification.body = line.trim()
      nova.notifications.add(dependencyErrorNotification)
      console.log(line)
    })
    process.onDidExit(status => {
      if (status === 0) {
        resolve()
      } else {
        console.error(status)
        reject(status)
      }
    })
    console.log("Fetching dependencies")
    const dependencyNotification = new NotificationRequest("dependencies")
    dependencyNotification.body = "Fetching dependencies"
    nova.notifications.add(dependencyNotification)
    process.start()
  })
}
