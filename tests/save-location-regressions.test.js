'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const chromeRoot = path.join(
  __dirname,
  '..',
  'AI_AI_Chrome'
);

const contentScriptSource =
  fs.readFileSync(
    path.join(
      chromeRoot,
      'content-script.js'
    ),
    'utf8'
  );

const serviceWorkerSource =
  fs.readFileSync(
    path.join(
      chromeRoot,
      'service-worker.js'
    ),
    'utf8'
  );

const saveBridgeSource =
  fs.readFileSync(
    path.join(
      chromeRoot,
      'save-bridge.js'
    ),
    'utf8'
  );

const optionsSource =
  fs.readFileSync(
    path.join(
      chromeRoot,
      'options.js'
    ),
    'utf8'
  );

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(
      chromeRoot,
      'manifest.json'
    ),
    'utf8'
  )
);


function quietConsole() {
  return {
    log() {},
    warn() {},
    error() {}
  };
}


function loadContentScript() {
  const context = {
    console: quietConsole(),
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        }
      }
    },
    URL,
    Date,
    Map,
    Set,
    Uint8Array,
    DataView,
    ArrayBuffer,
    Blob,
    TextEncoder,
    performance: {
      now: () => 0
    },
    location: {
      origin: 'https://arca.live',
      href: 'https://arca.live/b/test/1',
      pathname: '/b/test/1'
    },
    document: {
      querySelector: () => null
    },
    Node: {
      TEXT_NODE: 3,
      ELEMENT_NODE: 1
    },
    getComputedStyle: () => ({
      display: 'block',
      visibility: 'visible'
    }),
    atob: value =>
      Buffer.from(
        value,
        'base64'
      ).toString('binary'),
    setTimeout,
    clearTimeout
  };

  vm.createContext(context);
  vm.runInContext(
    contentScriptSource,
    context,
    { filename: 'content-script.js' }
  );

  return context;
}


async function runArtifactRoute(
  customResult
) {
  const context = loadContentScript();

  context.artifact = {
    bytes:
      new Uint8Array([1, 2, 3]),
    fileName:
      'AI_AI_fixture.zip',
    mimeType:
      'application/zip',
    artifactKind:
      'package-zip'
  };

  context.customResult = customResult;
  context.defaultCalls = [];

  const result =
    await vm.runInContext(
      `routeGeneratedArtifact(
        artifact,
        {
          attemptCustomSave:
            async () => customResult,
          defaultDownload:
            (bytes, mimeType, fileName) => {
              defaultCalls.push({
                bytes,
                mimeType,
                fileName
              });
            }
        }
      )`,
      context
    );

  return {
    context,
    result
  };
}


function loadSaveBridge(settings) {
  const parentWindow = {};
  const messages = [];
  const messageTransfers = [];
  let writeListener = null;
  let windowMessageListener = null;

  const port = {
    start() {},
    postMessage(message, transfer = []) {
      messages.push(message);
      messageTransfers.push(transfer);
    },
    addEventListener(type, listener) {
      if (type === 'message') {
        writeListener = listener;
      }
    }
  };

  const context = {
    console: quietConsole(),
    chrome: {
      runtime: {
        async sendMessage() {
          return {
            success: true,
            artifactKind:
              'package-zip',
            fileName:
              'AI_AI_fixture.zip',
            byteLength: 3
          };
        }
      }
    },
    AiAiSaveLocationDb: {
      async getSettings() {
        return settings;
      }
    },
    window: {
      addEventListener(type, listener) {
        if (type === 'message') {
          windowMessageListener = listener;
        }
      }
    },
    parent: parentWindow,
    navigator: {},
    ArrayBuffer,
    setTimeout,
    clearTimeout
  };

  vm.createContext(context);
  vm.runInContext(
    saveBridgeSource,
    context,
    { filename: 'save-bridge.js' }
  );

  context.testEvent = {
    source: parentWindow,
    origin: 'https://arca.live',
    data: {
      type: 'AI_AI_SAVE_CONNECT',
      nonce: 'a'.repeat(64)
    },
    ports: [port]
  };

  return {
    context,
    messages,
    messageTransfers,
    port,
    async connect() {
      windowMessageListener(
        context.testEvent
      );

      await new Promise(resolve =>
        setImmediate(resolve)
      );
    },
    getWriteListener: () =>
      writeListener
  };
}


function loadServiceWorker({
  mode = 'custom',
  hostAccessGranted = true,
  tabMessageResponse = {
    success: true,
    fileName: 'AI_AI_fixture.zip'
  },
  tabMessageError = null
} = {}) {
  let runtimeListener = null;
  let actionListener = null;

  const permissionChecks = [];
  const tabMessages = [];
  const badgeCalls = [];

  const extensionId =
    'fixtureextensionid';

  const context = {
    console: quietConsole(),
    importScripts() {},
    AiAiSaveLocationDb: {
      async getSettings() {
        return {
          mode,
          directoryHandle: null
        };
      }
    },
    chrome: {
      runtime: {
        id: extensionId,
        getURL(resource) {
          const normalized =
            resource.replace(/^\//, '');

          return normalized
            ? `chrome-extension://${extensionId}/${normalized}`
            : `chrome-extension://${extensionId}/`;
        },
        onMessage: {
          addListener(listener) {
            runtimeListener = listener;
          }
        }
      },
      action: {
        onClicked: {
          addListener(listener) {
            actionListener = listener;
          }
        },
        async setBadgeText(options) {
          badgeCalls.push(options);
        }
      },
      permissions: {
        async contains(permissions) {
          permissionChecks.push(
            permissions
          );

          return hostAccessGranted;
        }
      },
      tabs: {
        async sendMessage(
          tabId,
          message
        ) {
          tabMessages.push({
            tabId,
            message
          });

          if (tabMessageError) {
            throw tabMessageError;
          }

          return tabMessageResponse;
        }
      }
    },
    crypto,
    URL,
    Date,
    Map,
    Uint8Array,
    TextEncoder,
    ArrayBuffer,
    Blob,
    AbortController,
    fetch,
    setTimeout,
    clearTimeout,
    atob: value =>
      Buffer.from(
        value,
        'base64'
      ).toString('binary')
  };

  vm.createContext(context);
  vm.runInContext(
    serviceWorkerSource,
    context,
    { filename: 'service-worker.js' }
  );

  context.contentSender = {
    id: extensionId,
    tab: { id: 101 },
    url:
      'https://arca.live/b/test/1',
    origin: 'https://arca.live',
    documentId: 'content-document'
  };

  context.bridgeSender = {
    id: extensionId,
    tab: { id: 101 },
    url:
      `chrome-extension://${extensionId}/save-bridge.html`,
    origin: vm.runInContext(
      'AI_AI_EXTENSION_ORIGIN',
      context
    ),
    documentId: 'bridge-document'
  };

  context.prepareMessage = {
    type: 'AI_AI_SAVE_PREPARE',
    artifactKind: 'package-zip',
    fileName: 'AI_AI_fixture.zip',
    byteLength: 3
  };

  return {
    context,
    runtimeListener,
    getActionListener: () =>
      actionListener,
    permissionChecks,
    tabMessages,
    badgeCalls
  };
}


async function issueNonce(context) {
  return vm.runInContext(
    `prepareCustomSave(
      prepareMessage,
      contentSender
    )`,
    context
  );
}


test('action click checks all required Arca media hosts and starts extraction when access is granted', async () => {
  const serviceWorker =
    loadServiceWorker();

  await serviceWorker
    .getActionListener()({
      id: 303
    });

  assert.equal(
    serviceWorker.permissionChecks.length,
    1
  );

  assert.deepEqual(
    Array.from(
      serviceWorker
        .permissionChecks[0]
        .origins
    ),
    [
      'https://arca.live/*',
      'https://ac.arca.live/*',
      'https://ac-o.arca.live/*'
    ]
  );

  assert.equal(
    serviceWorker.tabMessages.length,
    1
  );
  assert.equal(
    serviceWorker.tabMessages[0].tabId,
    303
  );
  assert.equal(
    serviceWorker.tabMessages[0]
      .message.type,
    'AI_AI_RUN'
  );

  assert.deepEqual(
    serviceWorker.badgeCalls.map(
      call => call.text
    ),
    ['…', '']
  );

  assert.doesNotMatch(
    serviceWorkerSource,
    /permissions\.request\s*\(/
  );
});


test('denied required host access stops extraction and leaves a visible action warning', async () => {
  const serviceWorker =
    loadServiceWorker({
      hostAccessGranted: false
    });

  await serviceWorker
    .getActionListener()({
      id: 404
    });

  assert.equal(
    serviceWorker.permissionChecks.length,
    1
  );
  assert.equal(
    serviceWorker.tabMessages.length,
    0
  );

  assert.deepEqual(
    serviceWorker.badgeCalls.map(
      call => call.text
    ),
    ['!']
  );
});


test('action message delivery failure leaves a visible action warning', async () => {
  const serviceWorker =
    loadServiceWorker({
      tabMessageError:
        new Error(
          'Receiving end does not exist'
        )
    });

  await serviceWorker
    .getActionListener()({
      id: 405
    });

  assert.equal(
    serviceWorker.tabMessages.length,
    1
  );
  assert.deepEqual(
    serviceWorker.badgeCalls.map(
      call => call.text
    ),
    ['…', '!']
  );
});


test('content-reported delivery failure leaves a visible action warning', async () => {
  const serviceWorker =
    loadServiceWorker({
      tabMessageResponse: {
        success: false,
        status: 'delivery-failed'
      }
    });

  await serviceWorker
    .getActionListener()({
      id: 406
    });

  assert.deepEqual(
    serviceWorker.badgeCalls.map(
      call => call.text
    ),
    ['…', '!']
  );
});


test('missing content response is not treated as a successful action command', async () => {
  const serviceWorker =
    loadServiceWorker({
      tabMessageResponse: null
    });

  await serviceWorker
    .getActionListener()({
      id: 407
    });

  assert.deepEqual(
    serviceWorker.badgeCalls.map(
      call => call.text
    ),
    ['…', '!']
  );
});


test('default mode uses the existing Chrome download route', async () => {
  const { context, result } =
    await runArtifactRoute({
      status: 'not-used',
      reason: 'default-mode',
      ownershipTransferred: false
    });

  assert.equal(result.route, 'default');
  assert.equal(context.defaultCalls.length, 1);

  const serviceWorker =
    loadServiceWorker({
      mode: 'default'
    });

  const prepare =
    await issueNonce(
      serviceWorker.context
    );

  assert.equal(prepare.status, 'default');
  assert.equal('nonce' in prepare, false);
});


test('custom mode without a handle does not write and reports NOT_READY', async () => {
  const bridge = loadSaveBridge({
    mode: 'custom',
    directoryHandle: null
  });

  await bridge.connect();

  assert.equal(
    bridge.messages[0].status,
    'handle-missing'
  );
  assert.equal(
    bridge.messages[0]
      .permissionRequestAttempted,
    false
  );
  assert.equal(
    bridge.getWriteListener(),
    null
  );
});


test('prompt permission never triggers automatic requestPermission', async () => {
  let requestCount = 0;

  const bridge = loadSaveBridge({
    mode: 'custom',
    directoryHandle: {
      async queryPermission() {
        return 'prompt';
      },
      async requestPermission() {
        requestCount++;
      }
    }
  });

  await bridge.connect();

  assert.equal(requestCount, 0);
  assert.equal(
    bridge.messages[0].permission,
    'prompt'
  );
  assert.equal(
    bridge.messages[0]
      .permissionRequestAttempted,
    false
  );
});


test('denied permission never triggers automatic requestPermission', async () => {
  let requestCount = 0;

  const bridge = loadSaveBridge({
    mode: 'custom',
    directoryHandle: {
      async queryPermission() {
        return 'denied';
      },
      async requestPermission() {
        requestCount++;
      }
    }
  });

  await bridge.connect();

  assert.equal(requestCount, 0);
  assert.equal(
    bridge.messages[0].permission,
    'denied'
  );
});


test('granted custom handle reaches the bridge READY state', async () => {
  const bridge = loadSaveBridge({
    mode: 'custom',
    directoryHandle: {
      async queryPermission() {
        return 'granted';
      }
    }
  });

  await bridge.connect();

  assert.equal(
    bridge.messages[0].type,
    'AI_AI_SAVE_READY'
  );
  assert.equal(
    typeof bridge.getWriteListener(),
    'function'
  );
});


test('custom save success does not create a duplicate default download', async () => {
  const { context, result } =
    await runArtifactRoute({
      status: 'complete',
      fileName:
        'AI_AI_fixture (1).zip',
      byteLength: 3,
      ownershipTransferred: true
    });

  assert.equal(result.route, 'custom');
  assert.equal(
    result.fileName,
    'AI_AI_fixture (1).zip'
  );
  assert.equal(context.defaultCalls.length, 0);
});


test('failure before transfer falls back with the original bytes', async () => {
  const { context, result } =
    await runArtifactRoute({
      status: 'not-ready',
      reason:
        'permission-not-granted',
      ownershipTransferred: false
    });

  assert.equal(result.route, 'default');
  assert.equal(
    context.defaultCalls[0].bytes,
    context.artifact.bytes
  );
});


test('write failure after transfer falls back with the returned ArrayBuffer', async () => {
  const returnedBuffer =
    Uint8Array.from([9, 8, 7]).buffer;

  const { context, result } =
    await runArtifactRoute({
      status: 'write-failed',
      reason: 'write-failed',
      ownershipTransferred: true,
      returnedBuffer
    });

  assert.equal(result.route, 'default');
  assert.equal(
    context.defaultCalls[0].bytes,
    returnedBuffer
  );
});


test('bridge write failure returns the same buffer with a transfer list', async () => {
  const directoryHandle = {
    async queryPermission() {
      return 'granted';
    },
    async getFileHandle(
      fileName,
      options = {}
    ) {
      if (!options.create) {
        const error =
          new Error('missing');
        error.name = 'NotFoundError';
        throw error;
      }

      throw new Error('fixture write open failure');
    }
  };

  const bridge = loadSaveBridge({
    mode: 'custom',
    directoryHandle
  });

  await bridge.connect();

  const buffer =
    Uint8Array.from([1, 2, 3])
      .buffer;

  await bridge.getWriteListener()({
    data: {
      type: 'AI_AI_SAVE_WRITE',
      buffer
    }
  });

  const failure =
    bridge.messages.at(-1);

  assert.equal(
    failure.status,
    'write-failed'
  );
  assert.equal(
    failure.returnedBuffer,
    buffer
  );
  assert.equal(
    bridge.messageTransfers.at(-1)
      .length,
    1
  );
  assert.equal(
    bridge.messageTransfers.at(-1)[0],
    buffer
  );
});


test('unknown nonce is rejected', () => {
  const { context } = loadServiceWorker();

  context.unknownMessage = {
    nonce: 'f'.repeat(64)
  };

  const result = vm.runInContext(
    `authorizeCustomSave(
      unknownMessage,
      bridgeSender
    )`,
    context
  );

  assert.equal(result.success, false);
  assert.equal(result.reason, 'unknown-nonce');
});


test('nonce replay is rejected after the first authorization', async () => {
  const { context } = loadServiceWorker();
  const issuance = await issueNonce(context);

  context.authorizeMessage = {
    nonce: issuance.nonce
  };

  const first = vm.runInContext(
    'authorizeCustomSave(authorizeMessage, bridgeSender)',
    context
  );

  const replay = vm.runInContext(
    'authorizeCustomSave(authorizeMessage, bridgeSender)',
    context
  );

  assert.equal(first.success, true);
  assert.equal(replay.reason, 'nonce-used');
});


test('expired nonce is rejected', async () => {
  const { context } = loadServiceWorker();
  const issuance = await issueNonce(context);

  context.authorizeMessage = {
    nonce: issuance.nonce
  };

  vm.runInContext(
    'aiAiSaveNonces.get(authorizeMessage.nonce).expiresAt = 0',
    context
  );

  const result = vm.runInContext(
    'authorizeCustomSave(authorizeMessage, bridgeSender)',
    context
  );

  assert.equal(result.reason, 'nonce-expired');
});


test('nonce authorization from a different tab is rejected', async () => {
  const { context } = loadServiceWorker();
  const issuance = await issueNonce(context);

  context.authorizeMessage = {
    nonce: issuance.nonce
  };

  context.bridgeSender.tab.id = 202;

  const result = vm.runInContext(
    'authorizeCustomSave(authorizeMessage, bridgeSender)',
    context
  );

  assert.equal(result.reason, 'tab-mismatch');
});


test('unexpected bridge sender is rejected', async () => {
  const { context } = loadServiceWorker();
  const issuance = await issueNonce(context);

  context.authorizeMessage = {
    nonce: issuance.nonce
  };

  context.bridgeSender.url =
    'https://arca.live/b/test/1';
  context.bridgeSender.origin =
    'https://arca.live';

  const result = vm.runInContext(
    'authorizeCustomSave(authorizeMessage, bridgeSender)',
    context
  );

  assert.equal(
    result.reason,
    'unexpected-authorize-sender'
  );
});


test('unsafe, absolute, drive, backslash, and traversal filenames are rejected', () => {
  const { context } = loadServiceWorker();

  const invalidNames = [
    '',
    '../AI_AI_evil.zip',
    '..\\AI_AI_evil.zip',
    '/AI_AI_evil.zip',
    '\\AI_AI_evil.zip',
    'C:\\AI_AI_evil.zip',
    'AI_AI_evil\0.zip',
    'not_AI_AI_file.zip',
    'AI_AI_wrong.json'
  ];

  for (const fileName of invalidNames) {
    context.invalidDescriptor = {
      artifactKind: 'package-zip',
      fileName,
      byteLength: 3
    };

    const result = vm.runInContext(
      'validateSaveArtifactDescriptor(invalidDescriptor)',
      context
    );

    assert.equal(
      result.valid,
      false,
      fileName
    );
  }
});


test('filename collision preserves existing files and selects the (2) name', async () => {
  const existing = new Set([
    'AI_AI_fixture.zip',
    'AI_AI_fixture (1).zip'
  ]);

  const writes = [];

  const directoryHandle = {
    async queryPermission() {
      return 'granted';
    },
    async getFileHandle(
      fileName,
      options = {}
    ) {
      if (!options.create) {
        if (existing.has(fileName)) {
          return {};
        }

        const error =
          new Error('missing');
        error.name = 'NotFoundError';
        throw error;
      }

      existing.add(fileName);

      return {
        async createWritable() {
          return {
            async write(buffer) {
              writes.push({
                fileName,
                bytes:
                  Array.from(
                    new Uint8Array(buffer)
                  )
              });
            },
            async close() {}
          };
        }
      };
    }
  };

  const bridge = loadSaveBridge({
    mode: 'custom',
    directoryHandle
  });

  bridge.context.navigator = {
    locks: {
      async request(name, callback) {
        assert.equal(
          name,
          'AI_AI_custom_save_write'
        );
        return callback();
      }
    }
  };

  await bridge.connect();

  await bridge.getWriteListener()({
    data: {
      type: 'AI_AI_SAVE_WRITE',
      buffer:
        Uint8Array.from([1, 2, 3])
          .buffer
    }
  });

  assert.equal(
    bridge.messages.at(-1).fileName,
    'AI_AI_fixture (2).zip'
  );
  assert.equal(writes.length, 1);
  assert.equal(
    existing.has(
      'AI_AI_fixture.zip'
    ),
    true
  );
});


test('runtime prepare message contains no binary, base64, ZIP, or media bytes', () => {
  const context = loadContentScript();

  context.messageArtifact = {
    artifactKind: 'package-zip',
    fileName: 'AI_AI_fixture.zip'
  };

  const message = vm.runInContext(
    `buildSavePrepareMessage(
      messageArtifact,
      134217728
    )`,
    context
  );

  const serialized =
    JSON.stringify(message);

  assert.equal(
    Object.values(message).some(
      value =>
        value instanceof ArrayBuffer
        || ArrayBuffer.isView(value)
    ),
    false
  );
  assert.equal(
    /base64|mediaBytes|zipBytes|buffer/i
      .test(serialized),
    false
  );
  assert.ok(
    Buffer.byteLength(serialized)
      < 512
  );
});


test('save-location runtime state is not copied into the AI consumer payload', () => {
  const context = loadContentScript();

  context.fixture = {
    extraction: {
      version:
        '0.3.30-ai-consumer-payload-1'
    },
    post: {
      channel: 'test',
      postNumber: '1',
      title: 'test'
    },
    body: {
      text: 'article content'
    },
    comments: {
      items: []
    },
    diagnostics: {
      warnings: [],
      errors: []
    },
    saveLocation: {
      absolutePath:
        'C:\\Users\\FAKE_LOCAL_SAVE\\private',
      handle: {
        name: 'FAKE_HANDLE'
      }
    }
  };

  const payload = vm.runInContext(
    'buildAiConsumerPayload(fixture)',
    context
  );

  const serialized =
    JSON.stringify(payload);

  assert.equal(
    serialized.includes(
      'FAKE_LOCAL_SAVE'
    ),
    false
  );
  assert.equal(
    serialized.includes(
      'FAKE_HANDLE'
    ),
    false
  );
});


test('JSON fallback uses the same generated-artifact routing layer', async () => {
  const context = loadContentScript();

  context.fixture = {
    extraction: {
      version:
        '0.3.30-ai-consumer-payload-1'
    },
    post: {
      channel: 'test',
      postNumber: '1',
      title: 'test'
    },
    body: {
      text: 'article content'
    },
    comments: {
      items: []
    },
    diagnostics: {
      warnings: [],
      errors: []
    }
  };

  context.capturedArtifact = null;

  await vm.runInContext(
    `saveGeneratedArtifact =
      async artifact => {
        capturedArtifact = artifact;
        return {
          status: 'complete',
          fileName: artifact.fileName
        };
      };
    downloadJsonResult(fixture);`,
    context
  );

  assert.equal(
    context.capturedArtifact
      .artifactKind,
    'json-fallback'
  );
  assert.equal(
    context.capturedArtifact
      .mimeType,
    'application/json;charset=utf-8'
  );
  assert.ok(
    context.capturedArtifact
      .fileName
      .endsWith('.json')
  );
});


test('settings reset returns to default mode and removes the selected handle', async () => {
  const listeners = {};

  function element(id) {
    return {
      id,
      checked: false,
      disabled: false,
      textContent: '',
      addEventListener(type, listener) {
        listeners[`${id}:${type}`] =
          listener;
      }
    };
  }

  const elements = {
    'default-mode': element('default-mode'),
    'custom-mode': element('custom-mode'),
    'folder-name': element('folder-name'),
    status: element('status'),
    'request-permission':
      element('request-permission'),
    'choose-directory':
      element('choose-directory'),
    'use-default':
      element('use-default')
  };

  let settings = {
    mode: 'custom',
    directoryHandle: {
      name: 'AI_AI_Test',
      async queryPermission() {
        return 'granted';
      }
    }
  };

  let resetCount = 0;

  const context = {
    console: quietConsole(),
    document: {
      getElementById(id) {
        return elements[id];
      }
    },
    AiAiSaveLocationDb: {
      async getSettings() {
        return settings;
      },
      async setCustomDirectory() {},
      async resetToDefault() {
        resetCount++;
        settings = {
          mode: 'default',
          directoryHandle: null
        };
      }
    },
    showDirectoryPicker() {}
  };

  vm.createContext(context);
  vm.runInContext(
    optionsSource,
    context,
    { filename: 'options.js' }
  );

  await new Promise(resolve =>
    setImmediate(resolve)
  );

  await listeners[
    'use-default:click'
  ]();

  assert.equal(resetCount, 1);
  assert.equal(
    elements['default-mode'].checked,
    true
  );
  assert.equal(
    elements['custom-mode'].checked,
    false
  );
  assert.equal(
    elements['folder-name']
      .textContent,
    '설정되지 않음'
  );
});


test('v0.3.32 manifest keeps only the required save UI surface and extraction schema version', () => {
  assert.equal(manifest.version, '0.3.32');
  assert.deepEqual(
    manifest.host_permissions,
    [
      'https://arca.live/*',
      'https://ac.arca.live/*',
      'https://ac-o.arca.live/*'
    ]
  );
  assert.deepEqual(
    manifest.content_scripts[0].matches,
    ['https://arca.live/b/*']
  );
  assert.equal(
    manifest.options_page,
    'options.html'
  );
  assert.deepEqual(
    manifest.web_accessible_resources,
    [
      {
        resources: [
          'save-bridge.html'
        ],
        matches: [
          'https://arca.live/*'
        ]
      }
    ]
  );

  for (
    const forbiddenPermission of [
      'downloads',
      'storage',
      'offscreen',
      'unlimitedStorage'
    ]
  ) {
    assert.equal(
      (manifest.permissions ?? []).includes(
        forbiddenPermission
      ),
      false
    );
  }

  assert.equal(
    'externally_connectable' in manifest,
    false
  );
  assert.match(
    contentScriptSource,
    /0\.3\.30-ai-consumer-payload-1/
  );
  assert.doesNotMatch(
    contentScriptSource,
    /0\.3\.31-save-location-1/
  );
  assert.match(
    contentScriptSource,
    /package-v0\.3\.32\.zip/
  );
  assert.doesNotMatch(
    contentScriptSource,
    /package-v0\.3\.31\.zip/
  );
});
