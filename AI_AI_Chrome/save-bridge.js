(() => {
  'use strict';

  const EXPECTED_PARENT_ORIGIN =
    'https://arca.live';

  const MAX_FILE_NAME_ATTEMPTS =
    1000;


  function describeError(error) {
    return {
      name:
        error?.name || 'Error',
      message:
        error?.message
        || String(error)
    };
  }


  function postPortMessage(
    port,
    message,
    transfer = []
  ) {
    port.postMessage(
      message,
      transfer
    );
  }


  function collisionFileName(
    fileName,
    collisionIndex
  ) {
    if (collisionIndex === 0) {
      return fileName;
    }

    const dotIndex =
      fileName.lastIndexOf('.');

    const stem =
      dotIndex > 0
        ? fileName.slice(0, dotIndex)
        : fileName;

    const extension =
      dotIndex > 0
        ? fileName.slice(dotIndex)
        : '';

    return `${stem} (${collisionIndex})${extension}`;
  }


  async function findAvailableFileName(
    directoryHandle,
    fileName,
    maxAttempts = MAX_FILE_NAME_ATTEMPTS
  ) {
    for (
      let index = 0;
      index < maxAttempts;
      index++
    ) {
      const candidate =
        collisionFileName(
          fileName,
          index
        );

      try {
        await directoryHandle
          .getFileHandle(candidate);
      }
      catch (error) {
        if (error?.name === 'NotFoundError') {
          return candidate;
        }

        if (error?.name === 'TypeMismatchError') {
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      'collision-free filename limit reached'
    );
  }


  async function writeArtifactWithoutOverwrite({
    directoryHandle,
    fileName,
    buffer
  }) {
    const writeOnce = async () => {
      const selectedFileName =
        await findAvailableFileName(
          directoryHandle,
          fileName
        );

      const fileHandle =
        await directoryHandle
          .getFileHandle(
            selectedFileName,
            { create: true }
          );

      const writable =
        await fileHandle
          .createWritable();

      await writable.write(buffer);
      await writable.close();

      return selectedFileName;
    };

    if (navigator.locks?.request) {
      return navigator.locks.request(
        'AI_AI_custom_save_write',
        writeOnce
      );
    }

    return writeOnce();
  }


  async function initializeSaveConnection(
    event
  ) {
    if (
      event.source !== parent
      || event.origin
        !== EXPECTED_PARENT_ORIGIN
      || event.data?.type
        !== 'AI_AI_SAVE_CONNECT'
      || event.ports.length !== 1
    ) {
      return;
    }

    const port = event.ports[0];
    port.start();

    const authorization =
      await chrome.runtime.sendMessage({
        type:
          'AI_AI_SAVE_AUTHORIZE',
        nonce:
          event.data.nonce
      });

    if (!authorization?.success) {
      postPortMessage(
        port,
        {
          type:
            'AI_AI_SAVE_NOT_READY',
          status:
            'authorization-failed',
          reason:
            authorization?.reason
            || 'authorization-failed'
        }
      );
      return;
    }

    let settings;

    try {
      settings =
        await AiAiSaveLocationDb
          .getSettings();
    }
    catch (error) {
      postPortMessage(
        port,
        {
          type:
            'AI_AI_SAVE_NOT_READY',
          status:
            'settings-read-failed',
          reason:
            'settings-read-failed',
          error:
            describeError(error)
        }
      );
      return;
    }

    if (
      settings.mode !== 'custom'
      || !settings.directoryHandle
    ) {
      postPortMessage(
        port,
        {
          type:
            'AI_AI_SAVE_NOT_READY',
          status:
            'handle-missing',
          reason:
            'handle-missing',
          permissionRequestAttempted:
            false
        }
      );
      return;
    }

    let permission;

    try {
      permission =
        await settings.directoryHandle
          .queryPermission({
            mode: 'readwrite'
          });
    }
    catch (error) {
      postPortMessage(
        port,
        {
          type:
            'AI_AI_SAVE_NOT_READY',
          status:
            'permission-query-failed',
          reason:
            'permission-query-failed',
          permissionRequestAttempted:
            false,
          error:
            describeError(error)
        }
      );
      return;
    }

    if (permission !== 'granted') {
      postPortMessage(
        port,
        {
          type:
            'AI_AI_SAVE_NOT_READY',
          status:
            'permission-not-granted',
          reason:
            'permission-not-granted',
          permission,
          permissionRequestAttempted:
            false
        }
      );
      return;
    }

    postPortMessage(
      port,
      {
        type: 'AI_AI_SAVE_READY',
        status: 'ready',
        permission,
        permissionRequestAttempted:
          false
      }
    );

    port.addEventListener(
      'message',
      async portEvent => {
        const data = portEvent.data;

        const receivedBuffer =
          data?.buffer;

        if (
          data?.type
            !== 'AI_AI_SAVE_WRITE'
          || !(receivedBuffer
            instanceof ArrayBuffer)
          || receivedBuffer.byteLength
            !== authorization.byteLength
        ) {
          const canReturnBuffer =
            receivedBuffer
              instanceof ArrayBuffer
            && receivedBuffer.byteLength
              > 0;

          postPortMessage(
            port,
            {
              type:
                'AI_AI_SAVE_WRITE_FAILED',
              status:
                'write-shape-mismatch',
              reason:
                'write-shape-mismatch',
              returnedBuffer:
                canReturnBuffer
                  ? receivedBuffer
                  : null
            },
            canReturnBuffer
              ? [receivedBuffer]
              : []
          );
          return;
        }

        const buffer = receivedBuffer;

        try {
          const savedFileName =
            await writeArtifactWithoutOverwrite({
              directoryHandle:
                settings.directoryHandle,
              fileName:
                authorization.fileName,
              buffer
            });

          postPortMessage(
            port,
            {
              type:
                'AI_AI_SAVE_COMPLETE',
              status: 'complete',
              fileName:
                savedFileName,
              byteLength:
                authorization.byteLength,
              artifactKind:
                authorization.artifactKind
            }
          );
        }
        catch (error) {
          if (buffer.byteLength > 0) {
            postPortMessage(
              port,
              {
                type:
                  'AI_AI_SAVE_WRITE_FAILED',
                status:
                  'write-failed',
                reason:
                  'write-failed',
                error:
                  describeError(error),
                returnedBuffer:
                  buffer
              },
              [buffer]
            );
          }
          else {
            postPortMessage(
              port,
              {
                type:
                  'AI_AI_SAVE_WRITE_FAILED',
                status:
                  'write-failed-buffer-unavailable',
                reason:
                  'write-failed-buffer-unavailable',
                error:
                  describeError(error)
              }
            );
          }
        }
      }
    );
  }


  window.addEventListener(
    'message',
    event => {
      initializeSaveConnection(event)
        .catch(error => {
          console.error(
            '[AI_AI] save bridge 연결 실패:',
            error
          );
        });
    }
  );
})();
