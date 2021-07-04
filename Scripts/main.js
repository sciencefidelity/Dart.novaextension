
var langserver = null;

exports.activate = function() {
    // Do work when the extension is activated
    langserver = new DartLanguageServer();
}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
    if (langserver) {
        langserver.deactivate();
        langserver = null;
    }
}

class DartLanguageServer {
    constructor() {
        // Observe the configuration setting for the server's location, and restart the server on change
        nova.config.observe('sciencefidelity.config.dart.analyzerPath', function(path) {
            this.start(path);
        }, this);
    }

    deactivate() {
        this.stop();
    }

    start(path) {
        if (this.languageClient) {
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
        }

        // Use the default server path
        // /usr/local/flutter/bin/cache/dart-sdk/bin/snapshots/analysis_server.dart.snapshot
        if (!path) {
            // path = '/usr/local/bin/example';
            path = '/usr/local/flutter/bin/cache/dart-sdk/bin/snapshots';
        }

        // Create the client
        var serverOptions = {
            path: path,
            args: ['--lsp']
        };
        var clientOptions = {
            // The set of document syntaxes for which the server is valid
            syntaxes: ['dart'],
        };
        var client = new LanguageClient(
          'analysis_server.dart.snapshot',
          'Dart Language Server',
          serverOptions,
          clientOptions
        );
        console.log(JSON.stringify(serverOptions));

        try {
            // Start the client
            client.start();
            console.log('Client started');
            // Add the client to the subscriptions to be cleaned up
            nova.subscriptions.add(client);
            this.languageClient = client;
        }
        catch (err) {
            // If the .start() method throws, it's likely because the path to the language server is invalid

            if (nova.inDevMode()) {
                console.error(err);
            }
        }
    }

    stop() {
        if (this.languageClient) {
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
            this.languageClient = null;
        }
    }
}

