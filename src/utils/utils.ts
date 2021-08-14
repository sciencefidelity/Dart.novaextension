export async function makeFileExecutable(file: string) {
  return new Promise<void>((resolve, reject) => {
    const process = new Process("/usr/bin/env", {
      args: ["chmod", "u+x", file]
    })
    process.onDidExit(status => {
      if (status === 0) {
        resolve()
      } else {
        reject(status)
      }
    })
    process.start()
  })
}

export async function stopProcess(process: Process | null) {
  if (process) {
    process.terminate()
    process = null
  }
}

export function wrapCommand(
  // eslint-disable-next-line no-unused-vars
  command: (...args: any[]) => void | Promise<void>
  // eslint-disable-next-line no-unused-vars
): (...args: any[]) => void {
  return async function wrapped(...args: any[]) {
    try {
      await command(...args)
    } catch (err) {
      nova.workspace.showErrorMessage(err)
    }
  }
}