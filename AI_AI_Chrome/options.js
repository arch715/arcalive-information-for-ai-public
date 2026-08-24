(() => {
  'use strict';

  const defaultModeInput =
    document.getElementById(
      'default-mode'
    );

  const customModeInput =
    document.getElementById(
      'custom-mode'
    );

  const folderNameElement =
    document.getElementById(
      'folder-name'
    );

  const statusElement =
    document.getElementById(
      'status'
    );

  const requestPermissionButton =
    document.getElementById(
      'request-permission'
    );

  let currentDirectoryHandle = null;


  function describeError(error) {
    return {
      name:
        error?.name || 'Error',
      message:
        error?.message
        || String(error)
    };
  }


  function setStatus(message) {
    statusElement.textContent = message;
  }


  async function refreshSaveLocationState() {
    try {
      const settings =
        await AiAiSaveLocationDb
          .getSettings();

      currentDirectoryHandle =
        settings.directoryHandle;

      defaultModeInput.checked =
        settings.mode !== 'custom';

      customModeInput.checked =
        settings.mode === 'custom';

      folderNameElement.textContent =
        currentDirectoryHandle?.name
        || '설정되지 않음';

      requestPermissionButton.disabled =
        !currentDirectoryHandle;

      if (settings.mode !== 'custom') {
        setStatus(
          '기본 다운로드 사용 중'
        );
        return;
      }

      if (!currentDirectoryHandle) {
        setStatus(
          '사용자 지정 폴더 정보가 없습니다. 폴더를 다시 선택해 주세요.'
        );
        return;
      }

      const permission =
        await currentDirectoryHandle
          .queryPermission({
            mode: 'readwrite'
          });

      if (permission === 'granted') {
        setStatus(
          '사용자 지정 폴더 사용 가능'
        );
      }
      else {
        setStatus(
          '폴더 권한 재허용 필요'
        );
      }
    }
    catch (error) {
      console.error(
        '[AI_AI] 저장 위치 상태 확인 실패:',
        describeError(error)
      );

      setStatus(
        '저장 위치 상태를 확인하지 못했습니다. 기본 다운로드는 계속 사용할 수 있습니다.'
      );
    }
  }


  document
    .getElementById(
      'choose-directory'
    )
    .addEventListener(
      'click',
      async () => {
        try {
          const directoryHandle =
            await showDirectoryPicker({
              mode: 'readwrite'
            });

          await AiAiSaveLocationDb
            .setCustomDirectory(
              directoryHandle
            );
        }
        catch (error) {
          if (error?.name !== 'AbortError') {
            console.error(
              '[AI_AI] 사용자 지정 폴더 선택 실패:',
              describeError(error)
            );
          }
        }

        await refreshSaveLocationState();
      }
    );


  requestPermissionButton
    .addEventListener(
      'click',
      async () => {
        if (!currentDirectoryHandle) {
          await refreshSaveLocationState();
          return;
        }

        try {
          await currentDirectoryHandle
            .requestPermission({
              mode: 'readwrite'
            });
        }
        catch (error) {
          console.error(
            '[AI_AI] 사용자 지정 폴더 권한 요청 실패:',
            describeError(error)
          );
        }

        await refreshSaveLocationState();
      }
    );


  document
    .getElementById('use-default')
    .addEventListener(
      'click',
      async () => {
        try {
          await AiAiSaveLocationDb
            .resetToDefault();
        }
        catch (error) {
          console.error(
            '[AI_AI] 기본 다운로드 설정 복귀 실패:',
            describeError(error)
          );
        }

        await refreshSaveLocationState();
      }
    );


  refreshSaveLocationState();
})();
