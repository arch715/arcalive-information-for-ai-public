(() => {
  'use strict';

  const DATABASE_NAME =
    'AI_AI_save_location';

  const DATABASE_VERSION = 1;

  const STORE_NAME = 'settings';

  const MODE_KEY = 'saveMode';

  const DIRECTORY_HANDLE_KEY =
    'directoryHandle';


  function requestAsPromise(request) {
    return new Promise(
      (resolve, reject) => {
        request.addEventListener(
          'success',
          () => resolve(request.result),
          { once: true }
        );

        request.addEventListener(
          'error',
          () => reject(request.error),
          { once: true }
        );
      }
    );
  }


  function transactionAsPromise(
    transaction
  ) {
    return new Promise(
      (resolve, reject) => {
        transaction.addEventListener(
          'complete',
          resolve,
          { once: true }
        );

        transaction.addEventListener(
          'abort',
          () => reject(transaction.error),
          { once: true }
        );

        transaction.addEventListener(
          'error',
          () => reject(transaction.error),
          { once: true }
        );
      }
    );
  }


  async function openDatabase() {
    const request =
      indexedDB.open(
        DATABASE_NAME,
        DATABASE_VERSION
      );

    request.addEventListener(
      'upgradeneeded',
      () => {
        if (
          !request.result
            .objectStoreNames
            .contains(STORE_NAME)
        ) {
          request.result
            .createObjectStore(
              STORE_NAME
            );
        }
      }
    );

    return requestAsPromise(request);
  }


  async function getSettings() {
    const database =
      await openDatabase();

    try {
      const transaction =
        database.transaction(
          STORE_NAME,
          'readonly'
        );

      const transactionDone =
        transactionAsPromise(
          transaction
        );

      const store =
        transaction.objectStore(
          STORE_NAME
        );

      const [mode, directoryHandle] =
        await Promise.all([
          requestAsPromise(
            store.get(MODE_KEY)
          ),
          requestAsPromise(
            store.get(
              DIRECTORY_HANDLE_KEY
            )
          )
        ]);

      await transactionDone;

      return {
        mode:
          mode === 'custom'
            ? 'custom'
            : 'default',
        directoryHandle:
          directoryHandle || null
      };
    }
    finally {
      database.close();
    }
  }


  async function setCustomDirectory(
    directoryHandle
  ) {
    const database =
      await openDatabase();

    try {
      const transaction =
        database.transaction(
          STORE_NAME,
          'readwrite'
        );

      const transactionDone =
        transactionAsPromise(
          transaction
        );

      const store =
        transaction.objectStore(
          STORE_NAME
        );

      store.put(
        directoryHandle,
        DIRECTORY_HANDLE_KEY
      );

      store.put(
        'custom',
        MODE_KEY
      );

      await transactionDone;
    }
    finally {
      database.close();
    }
  }


  async function resetToDefault() {
    const database =
      await openDatabase();

    try {
      const transaction =
        database.transaction(
          STORE_NAME,
          'readwrite'
        );

      const transactionDone =
        transactionAsPromise(
          transaction
        );

      const store =
        transaction.objectStore(
          STORE_NAME
        );

      store.delete(
        DIRECTORY_HANDLE_KEY
      );

      store.put(
        'default',
        MODE_KEY
      );

      await transactionDone;
    }
    finally {
      database.close();
    }
  }


  globalThis.AiAiSaveLocationDb =
    Object.freeze({
      databaseName:
        DATABASE_NAME,
      getSettings,
      setCustomDirectory,
      resetToDefault
    });
})();
