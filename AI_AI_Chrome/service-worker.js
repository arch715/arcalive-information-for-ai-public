importScripts('save-location-db.js');


const AI_AI_REQUIRED_HOST_ORIGINS = [
  'https://arca.live/*',
  'https://ac.arca.live/*',
  'https://ac-o.arca.live/*'
];


const AI_AI_SAVE_NONCE_TTL_MS =
  30000;

const AI_AI_SAVE_MAX_BYTES =
  256 * 1024 * 1024;

const AI_AI_SAVE_BRIDGE_URL =
  chrome.runtime.getURL(
    'save-bridge.html'
  );

const AI_AI_EXTENSION_ORIGIN =
  new URL(
    chrome.runtime.getURL('/')
  ).origin;

const aiAiSaveNonces =
  new Map();


function randomSaveNonce() {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  return Array.from(
    bytes,
    value =>
      value
        .toString(16)
        .padStart(2, '0')
  ).join('');
}


function saveSenderObservation(sender) {
  return {
    tabId:
      Number.isInteger(
        sender?.tab?.id
      )
        ? sender.tab.id
        : null,
    url:
      sender?.url || null,
    documentId:
      sender?.documentId || null,
    origin:
      sender?.origin || null
  };
}


function isSaveContentSender(sender) {
  return sender?.id
    === chrome.runtime.id
    && Number.isInteger(
      sender?.tab?.id
    )
    && typeof sender?.url
      === 'string'
    && /^https:\/\/arca\.live\/b\//
      .test(sender.url)
    && sender?.origin
      === 'https://arca.live';
}


function isSaveBridgeSender(sender) {
  return sender?.id
    === chrome.runtime.id
    && Number.isInteger(
      sender?.tab?.id
    )
    && sender?.url
      === AI_AI_SAVE_BRIDGE_URL
    && sender?.origin
      === AI_AI_EXTENSION_ORIGIN;
}


function validateSaveArtifactDescriptor(
  message
) {
  const artifactKind =
    message?.artifactKind;

  const fileName =
    message?.fileName;

  const byteLength =
    message?.byteLength;

  const expectedExtension =
    artifactKind === 'package-zip'
      ? '.zip'
      : artifactKind
        === 'json-fallback'
        ? '.json'
        : null;

  if (!expectedExtension) {
    return {
      valid: false,
      reason:
        'invalid-artifact-kind'
    };
  }

  if (
    typeof fileName !== 'string'
    || fileName.length === 0
    || fileName.length > 240
    || !fileName.startsWith('AI_AI_')
    || !fileName.endsWith(
      expectedExtension
    )
    || fileName.includes('\0')
    || fileName.includes('/')
    || fileName.includes('\\')
    || fileName.includes('..')
    || /^[a-zA-Z]:/.test(fileName)
  ) {
    return {
      valid: false,
      reason: 'invalid-file-name'
    };
  }

  if (
    !Number.isSafeInteger(byteLength)
    || byteLength <= 0
    || byteLength
      > AI_AI_SAVE_MAX_BYTES
  ) {
    return {
      valid: false,
      reason: 'invalid-byte-length'
    };
  }

  return {
    valid: true,
    artifactKind,
    fileName,
    byteLength
  };
}


function pruneSaveNonces() {
  const now = Date.now();

  for (
    const [nonce, record]
    of aiAiSaveNonces
  ) {
    if (
      record.expiresAt
        + AI_AI_SAVE_NONCE_TTL_MS
      < now
    ) {
      aiAiSaveNonces.delete(nonce);
    }
  }
}


async function prepareCustomSave(
  message,
  sender
) {
  if (!isSaveContentSender(sender)) {
    return {
      success: false,
      status: 'fallback-default',
      reason: 'unexpected-prepare-sender'
    };
  }

  const descriptor =
    validateSaveArtifactDescriptor(
      message
    );

  if (!descriptor.valid) {
    return {
      success: false,
      status: 'fallback-default',
      reason: descriptor.reason
    };
  }

  let settings;

  try {
    settings =
      await AiAiSaveLocationDb
        .getSettings();
  }
  catch (error) {
    return {
      success: false,
      status: 'fallback-default',
      reason: 'settings-read-failed',
      error: String(error)
    };
  }

  if (settings.mode !== 'custom') {
    return {
      success: true,
      status: 'default'
    };
  }

  const nonce = randomSaveNonce();

  const record = {
    tabId: sender.tab.id,
    artifactKind:
      descriptor.artifactKind,
    fileName:
      descriptor.fileName,
    byteLength:
      descriptor.byteLength,
    expiresAt:
      Date.now()
      + AI_AI_SAVE_NONCE_TTL_MS,
    used: false,
    issuer:
      saveSenderObservation(sender)
  };

  aiAiSaveNonces.set(
    nonce,
    record
  );

  return {
    success: true,
    status: 'custom-prepare-ready',
    nonce,
    expiresInMs:
      AI_AI_SAVE_NONCE_TTL_MS
  };
}


function authorizeCustomSave(
  message,
  sender
) {
  if (!isSaveBridgeSender(sender)) {
    return {
      success: false,
      reason:
        'unexpected-authorize-sender',
      sender:
        saveSenderObservation(sender)
    };
  }

  const nonce = message?.nonce;

  if (
    typeof nonce !== 'string'
    || !/^[0-9a-f]{64}$/.test(nonce)
  ) {
    return {
      success: false,
      reason: 'malformed-nonce'
    };
  }

  const record =
    aiAiSaveNonces.get(nonce);

  if (!record) {
    return {
      success: false,
      reason: 'unknown-nonce'
    };
  }

  if (record.tabId !== sender.tab.id) {
    return {
      success: false,
      reason: 'tab-mismatch'
    };
  }

  if (record.used) {
    return {
      success: false,
      reason: 'nonce-used'
    };
  }

  if (record.expiresAt < Date.now()) {
    return {
      success: false,
      reason: 'nonce-expired'
    };
  }

  record.used = true;

  return {
    success: true,
    status: 'authorized',
    artifactKind:
      record.artifactKind,
    fileName:
      record.fileName,
    byteLength:
      record.byteLength,
    issuer:
      record.issuer,
    authorizer:
      saveSenderObservation(sender)
  };
}


chrome.action.onClicked.addListener(
  async (tab) => {
    if (!tab.id) {
      console.error(
        '[AI_AI] 현재 탭 ID를 찾지 못했습니다.'
      );
      return;
    }

    const tabId = tab.id;

    try {
      const hostAccessGranted =
        await chrome.permissions.contains({
          origins:
            AI_AI_REQUIRED_HOST_ORIGINS
        });

      if (!hostAccessGranted) {
        await setAiAiActionBadge(
          tabId,
          '!'
        );

        console.warn(
          '[AI_AI] 필수 사이트 접근 권한이 허용되지 않아 실행하지 않았습니다.'
        );
        return;
      }

      await setAiAiActionBadge(
        tabId,
        '…'
      );

      const response =
        await chrome.tabs.sendMessage(
          tabId,
          {
            type: 'AI_AI_RUN'
          }
        );

      await setAiAiActionBadge(
        tabId,
        response?.success === true
          || response?.status
            === 'already-running'
          ? ''
          : '!'
      );
    }
    catch (error) {
      await setAiAiActionBadge(
        tabId,
        '!'
      );

      console.error(
        '[AI_AI] 실행 명령 전달 실패:',
        error
      );
    }
  }
);


async function setAiAiActionBadge(
  tabId,
  text
) {
  try {
    await chrome.action.setBadgeText({
      tabId,
      text
    });
  }
  catch (error) {
    console.warn(
      '[AI_AI] action badge 갱신 실패:',
      String(error)
    );
  }
}


chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {

    pruneSaveNonces();

    if (
      message.type
      === 'AI_AI_SAVE_PREPARE'
    ) {
      prepareCustomSave(
        message,
        sender
      )
        .then(sendResponse)
        .catch(error => {
          sendResponse({
            success: false,
            status:
              'fallback-default',
            reason:
              'save-prepare-exception',
            error: String(error)
          });
        });

      return true;
    }

    if (
      message.type
      === 'AI_AI_SAVE_AUTHORIZE'
    ) {
      sendResponse(
        authorizeCustomSave(
          message,
          sender
        )
      );

      return false;
    }


    if (
      message.type
      === 'AI_AI_FETCH_MEDIA_BATCH'
    ) {
      fetchMediaBatch(message)
        .then(results => {
          sendResponse({
            success: true,
            results
          });
        })
        .catch(error => {
          console.error(
            '[AI_AI] 미디어 batch fetch 실패:',
            error
          );

          sendResponse({
            success: false,
            error: String(error)
          });
        });

      return true;
    }

    if (
      message.type
      === 'AI_AI_PROBE_IMAGE_DIMENSIONS_BATCH'
    ) {
      probeImageDimensionsBatch(message)
        .then(results => {
          sendResponse({
            success: true,
            results
          });
        })
        .catch(error => {
          console.error(
            '[AI_AI] 원본 이미지 Range 해상도 probe 실패:',
            error
          );

          sendResponse({
            success: false,
            error: String(error)
          });
        });

      return true;
    }

  }
);




async function probeImageDimensionsBatch(
  message
) {
  const resources =
    Array.isArray(message.resources)
      ? message.resources
      : [];

  const concurrency =
    clampInteger(
      message.concurrency,
      1,
      4,
      2
    );

  const timeoutMs =
    clampInteger(
      message.timeoutMs,
      1000,
      30000,
      2500
    );

  const prefixBytes =
    clampInteger(
      message.prefixBytes,
      1024,
      256 * 1024,
      64 * 1024
    );

  return mapWithConcurrency(
    resources,
    concurrency,
    resource =>
      probeOneImageDimensions(
        resource,
        {
          timeoutMs,
          prefixBytes
        }
      )
  );
}


async function probeOneImageDimensions(
  resource,
  {
    timeoutMs,
    prefixBytes
  }
) {
  const startedAt =
    performance.now();

  const url =
    resource?.url
    ?? null;

  const base = {
    sampleIndex:
      resource?.sampleIndex
      ?? null,
    displayResourceIndex:
      resource
        ?.displayResourceIndex
      ?? null,
    originalResourceIndex:
      resource
        ?.originalResourceIndex
      ?? null,
    assetHashCandidate:
      resource
        ?.assetHashCandidate
      ?? null
  };

  if (!isAllowedMediaUrl(url)) {
    return {
      ...base,
      ok: false,
      status: null,
      contentType: null,
      contentRange: null,
      totalBytesFromContentRange: null,
      rangeHonored: false,
      bytesRead: 0,
      dimensionStatus:
        'failed',
      width: null,
      height: null,
      pixelCount: null,
      parser: null,
      skipReason:
        'unsupported-url',
      durationMs:
        Math.round(
          performance.now()
          - startedAt
        ),
      error:
        '허용되지 않은 미디어 URL'
    };
  }

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: 'GET',
          headers: {
            Range:
              `bytes=0-${prefixBytes - 1}`
          },
          credentials: 'omit',
          redirect: 'follow',
          cache: 'no-store',
          signal: controller.signal
        }
      );

    const contentType =
      response.headers.get(
        'content-type'
      );

    const contentRange =
      response.headers.get(
        'content-range'
      );

    const totalBytesFromContentRange =
      parseContentRangeTotal(
        contentRange
      );

    const rangeHonored =
      response.status === 206
      && Boolean(contentRange);

    if (!rangeHonored) {
      try {
        await response.body?.cancel();
      }
      catch {
        // Range가 무시된 경우 전체 body를 읽지 않는 것이 목적이므로,
        // body 취소 실패를 별도 치명 오류로 만들지 않는다.
      }

      return {
        ...base,
        ok:
          response.ok,
        status:
          response.status,
        contentType,
        contentRange,
        totalBytesFromContentRange,
        rangeHonored:
          false,
        bytesRead: 0,
        dimensionStatus:
          'not-probed',
        width: null,
        height: null,
        pixelCount: null,
        parser: null,
        skipReason:
          response.ok
            ? 'range-not-honored'
            : 'http-error',
        durationMs:
          Math.round(
            performance.now()
            - startedAt
          ),
        error:
          response.ok
            ? null
            : `HTTP ${response.status}`
      };
    }

    const bytes =
      new Uint8Array(
        await response.arrayBuffer()
      );

    const dimensions =
      parseImageDimensionsFromPrefix(
        bytes,
        contentType
      );

    return {
      ...base,
      ok:
        response.ok,
      status:
        response.status,
      contentType,
      contentRange,
      totalBytesFromContentRange,
      rangeHonored:
        true,
      bytesRead:
        bytes.byteLength,
      dimensionStatus:
        dimensions
          ? 'success'
          : 'unresolved-from-prefix',
      width:
        dimensions?.width
        ?? null,
      height:
        dimensions?.height
        ?? null,
      pixelCount:
        dimensions
          ? dimensions.width
            * dimensions.height
          : null,
      parser:
        dimensions?.parser
        ?? null,
      skipReason:
        dimensions
          ? null
          : 'dimension-not-found-in-prefix',
      durationMs:
        Math.round(
          performance.now()
          - startedAt
        ),
      error: null
    };
  }
  catch (error) {
    const timedOut =
      error?.name === 'AbortError';

    return {
      ...base,
      ok: false,
      status: null,
      contentType: null,
      contentRange: null,
      totalBytesFromContentRange: null,
      rangeHonored: false,
      bytesRead: 0,
      dimensionStatus:
        'failed',
      width: null,
      height: null,
      pixelCount: null,
      parser: null,
      skipReason:
        timedOut
          ? 'timeout'
          : 'fetch-exception',
      durationMs:
        Math.round(
          performance.now()
          - startedAt
        ),
      error:
        timedOut
          ? `timeout after ${timeoutMs}ms`
          : String(error)
    };
  }
  finally {
    clearTimeout(timeoutId);
  }
}


function parseImageDimensionsFromPrefix(
  bytes,
  contentType
) {
  if (
    !(bytes instanceof Uint8Array)
    || bytes.length < 10
  ) {
    return null;
  }

  return (
    parsePngDimensions(bytes)
    || parseJpegDimensions(bytes)
    || parseGifDimensions(bytes)
    || parseWebpDimensions(bytes)
    || null
  );
}


function parsePngDimensions(bytes) {
  const signature = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a
  ];

  if (
    bytes.length < 24
    || !signature.every(
      (value, index) =>
        bytes[index] === value
    )
  ) {
    return null;
  }

  const view =
    new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    );

  const width =
    view.getUint32(
      16,
      false
    );

  const height =
    view.getUint32(
      20,
      false
    );

  if (
    width <= 0
    || height <= 0
  ) {
    return null;
  }

  return {
    width,
    height,
    parser:
      'png-ihdr-prefix'
  };
}


function parseGifDimensions(bytes) {
  if (bytes.length < 10) {
    return null;
  }

  const signature =
    String.fromCharCode(
      ...bytes.subarray(0, 6)
    );

  if (
    signature !== 'GIF87a'
    && signature !== 'GIF89a'
  ) {
    return null;
  }

  const width =
    bytes[6]
    | (bytes[7] << 8);

  const height =
    bytes[8]
    | (bytes[9] << 8);

  if (
    width <= 0
    || height <= 0
  ) {
    return null;
  }

  return {
    width,
    height,
    parser:
      'gif-logical-screen-prefix'
  };
}


function parseJpegDimensions(bytes) {
  if (
    bytes.length < 4
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
  ) {
    return null;
  }

  const sofMarkers =
    new Set([
      0xc0,
      0xc1,
      0xc2,
      0xc3,
      0xc5,
      0xc6,
      0xc7,
      0xc9,
      0xca,
      0xcb,
      0xcd,
      0xce,
      0xcf
    ]);

  let offset = 2;

  while (
    offset + 3
    < bytes.length
  ) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }

    while (
      offset < bytes.length
      && bytes[offset] === 0xff
    ) {
      offset++;
    }

    if (offset >= bytes.length) {
      break;
    }

    const marker =
      bytes[offset];

    offset++;

    if (
      marker === 0xd8
      || marker === 0xd9
      || marker === 0x01
      || (
        marker >= 0xd0
        && marker <= 0xd7
      )
    ) {
      continue;
    }

    if (
      offset + 1
      >= bytes.length
    ) {
      break;
    }

    const segmentLength =
      (bytes[offset] << 8)
      | bytes[offset + 1];

    if (segmentLength < 2) {
      return null;
    }

    if (
      sofMarkers.has(marker)
    ) {
      if (
        offset + 7
        >= bytes.length
      ) {
        return null;
      }

      const height =
        (bytes[offset + 3] << 8)
        | bytes[offset + 4];

      const width =
        (bytes[offset + 5] << 8)
        | bytes[offset + 6];

      if (
        width <= 0
        || height <= 0
      ) {
        return null;
      }

      return {
        width,
        height,
        parser:
          'jpeg-sof-prefix'
      };
    }

    offset +=
      segmentLength;
  }

  return null;
}


function parseWebpDimensions(bytes) {
  if (bytes.length < 30) {
    return null;
  }

  const ascii = (
    start,
    length
  ) =>
    String.fromCharCode(
      ...bytes.subarray(
        start,
        start + length
      )
    );

  if (
    ascii(0, 4) !== 'RIFF'
    || ascii(8, 4) !== 'WEBP'
  ) {
    return null;
  }

  const chunkType =
    ascii(12, 4);

  if (chunkType === 'VP8X') {
    const width =
      1
      + bytes[24]
      + (bytes[25] << 8)
      + (bytes[26] << 16);

    const height =
      1
      + bytes[27]
      + (bytes[28] << 8)
      + (bytes[29] << 16);

    return {
      width,
      height,
      parser:
        'webp-vp8x-prefix'
    };
  }

  if (
    chunkType === 'VP8L'
    && bytes.length >= 25
    && bytes[20] === 0x2f
  ) {
    const b1 =
      bytes[21];

    const b2 =
      bytes[22];

    const b3 =
      bytes[23];

    const b4 =
      bytes[24];

    const width =
      1
      + b1
      + ((b2 & 0x3f) << 8);

    const height =
      1
      + (b2 >> 6)
      + (b3 << 2)
      + ((b4 & 0x0f) << 10);

    return {
      width,
      height,
      parser:
        'webp-vp8l-prefix'
    };
  }

  if (chunkType === 'VP8 ') {
    for (
      let offset = 20;
      offset + 6 < bytes.length;
      offset++
    ) {
      if (
        bytes[offset] === 0x9d
        && bytes[offset + 1]
          === 0x01
        && bytes[offset + 2]
          === 0x2a
      ) {
        const width =
          (
            bytes[offset + 3]
            | (
              bytes[offset + 4]
              << 8
            )
          )
          & 0x3fff;

        const height =
          (
            bytes[offset + 5]
            | (
              bytes[offset + 6]
              << 8
            )
          )
          & 0x3fff;

        if (
          width > 0
          && height > 0
        ) {
          return {
            width,
            height,
            parser:
              'webp-vp8-prefix'
          };
        }
      }
    }
  }

  return null;
}


async function fetchMediaBatch(message) {
  const resources =
    Array.isArray(message.resources)
      ? message.resources
      : [];

  const bodyConcurrency =
    clampInteger(
      message.bodyConcurrency,
      1,
      8,
      4
    );

  const metadataConcurrency =
    clampInteger(
      message.metadataConcurrency,
      1,
      4,
      2
    );

  const maxBytesPerResource =
    clampInteger(
      message.maxBytesPerResource,
      1,
      100 * 1024 * 1024,
      25 * 1024 * 1024
    );

  const bodyTimeoutMs =
    clampInteger(
      message.bodyTimeoutMs,
      1000,
      120000,
      15000
    );

  const metadataTimeoutMs =
    clampInteger(
      message.metadataTimeoutMs,
      1000,
      60000,
      5000
    );

  const retry429Count =
    clampInteger(
      message.retry429Count,
      0,
      4,
      2
    );

  const retryBaseDelayMs =
    clampInteger(
      message.retryBaseDelayMs,
      100,
      10000,
      750
    );

  const returnBodyBase64MaxBytes =
    clampInteger(
      message.returnBodyBase64MaxBytes,
      0,
      32 * 1024 * 1024,
      0
    );

  const returnBodyBase64MaxTotalBytes =
    clampInteger(
      message.returnBodyBase64MaxTotalBytes,
      0,
      32 * 1024 * 1024,
      0
    );

  const cacheMode =
    [
      'default',
      'no-store',
      'reload'
    ].includes(message.cacheMode)
      ? message.cacheMode
      : 'default';

  const indexed =
    resources.map(
      (resource, batchIndex) => ({
        ...resource,
        batchIndex
      })
    );

  const bodyItems =
    indexed.filter(
      resource =>
        resource.fetchMode
        !== 'metadata'
    );

  const metadataItems =
    indexed.filter(
      resource =>
        resource.fetchMode
        === 'metadata'
    );

  const output =
    new Array(resources.length);


  const commonOptions = {
    maxBytesPerResource,
    bodyTimeoutMs,
    metadataTimeoutMs,
    retry429Count,
    retryBaseDelayMs,
    returnBodyBase64MaxBytes,
    cacheMode,
  };

  await Promise.all([
    mapWithConcurrency(
      bodyItems,
      bodyConcurrency,
      async resource => {
        const result =
          await fetchOneMediaResource(
            resource,
            {
              ...commonOptions,
              fetchMode: 'body'
            }
          );

        output[
          resource.batchIndex
        ] = result;
      }
    ),

    mapWithConcurrency(
      metadataItems,
      metadataConcurrency,
      async resource => {
        const result =
          await fetchOneMediaResource(
            resource,
            {
              ...commonOptions,
              fetchMode: 'metadata'
            }
          );

        output[
          resource.batchIndex
        ] = result;
      }
    )
  ]);

  if (
    returnBodyBase64MaxTotalBytes > 0
  ) {
    let keptTransferBytes = 0;

    for (const result of output) {
      if (!result?.bodyTransferAvailable) {
        continue;
      }

      const transferBytes =
        Number.isFinite(
          result.bodyTransferByteLength
        )
          ? result.bodyTransferByteLength
          : 0;

      if (
        keptTransferBytes
          + transferBytes
        <= returnBodyBase64MaxTotalBytes
      ) {
        keptTransferBytes +=
          transferBytes;
        continue;
      }

      delete result.bodyBase64;
      result.bodyTransferAvailable =
        false;
      result.bodyTransferEncoding =
        null;
      result.bodyTransferByteLength =
        null;
      result.bodyTransferBase64Length =
        null;
      result.bodyTransferSkipReason =
        'batch-transfer-total-limit';
    }
  }

  return output;
}



function arrayBufferToBase64(
  arrayBuffer
) {
  const bytes =
    new Uint8Array(arrayBuffer);

  const chunkSize =
    0x8000;

  let binary = '';

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        offset,
        Math.min(
          offset + chunkSize,
          bytes.length
        )
      );

    binary +=
      String.fromCharCode(
        ...chunk
      );
  }

  return btoa(binary);
}


async function fetchOneMediaResource(
  resource,
  options
) {
  const startedAt =
    performance.now();

  const url =
    resource?.url ?? null;

  const fetchMode =
    options.fetchMode
    === 'metadata'
      ? 'metadata'
      : 'body';

  const base = {
    resourceIndex:
      resource?.resourceIndex
      ?? null,

    resourceKey:
      resource?.resourceKey
      ?? null,

    requestedUrl:
      url,

    fetchMode,
    attempts: 0,
    rateLimitEncountered: false,
    retryWaitMsTotal: 0
  };

  if (!isAllowedMediaUrl(url)) {
    return {
      ...base,
      ok: false,
      metadataFetched: false,
      bodyFetched: false,
      skipReason:
        'unsupported-url',
      status: null,
      statusText: null,
      redirected: false,
      finalUrl: null,
      responseContentType: null,
      responseContentLength: null,
      blobType: null,
      blobSize: null,
      durationMs:
        Math.round(
          performance.now()
          - startedAt
        ),
      error:
        '허용되지 않은 미디어 URL'
    };
  }

  let rateLimitEncountered = false;
  let retryWaitMsTotal = 0;
  let lastResult = null;

  for (
    let attempt = 0;
    attempt
      <= options.retry429Count;
    attempt++
  ) {
    const attemptResult =
      fetchMode === 'metadata'
        ? await fetchMetadataAttempt(
            url,
            options.metadataTimeoutMs
          )
        : await fetchBodyAttempt(
            url,
            options.maxBytesPerResource,
            options.bodyTimeoutMs,
            options.returnBodyBase64MaxBytes,
            options.cacheMode
          );

    attemptResult.attemptNumber =
      attempt;

    lastResult =
      attemptResult;

    if (
      attemptResult.status !== 429
      || attempt
        >= options.retry429Count
    ) {
      break;
    }

    rateLimitEncountered = true;

    const retryWaitMs =
      chooseRetryDelayMs(
        attemptResult.retryAfterMs,
        options.retryBaseDelayMs,
        attempt
      );

    retryWaitMsTotal +=
      retryWaitMs;

    await sleep(retryWaitMs);
  }

  return {
    ...base,
    ...lastResult,
    attempts:
      (
        lastResult?.attemptNumber
        ?? 0
      ) + 1,
    rateLimitEncountered:
      rateLimitEncountered
      || lastResult?.status === 429,
    retryWaitMsTotal,
    durationMs:
      Math.round(
        performance.now()
        - startedAt
      )
  };
}


async function fetchMetadataAttempt(
  url,
  timeoutMs
) {
  const headResult =
    await performMetadataRequest(
      url,
      'HEAD',
      timeoutMs
    );

  if (
    headResult.status !== 405
    && headResult.status !== 501
  ) {
    return headResult;
  }

  return performMetadataRequest(
    url,
    'GET-range',
    timeoutMs
  );
}


async function performMetadataRequest(
  url,
  methodMode,
  timeoutMs
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          method:
            methodMode === 'HEAD'
              ? 'HEAD'
              : 'GET',
          headers:
            methodMode === 'GET-range'
              ? {
                  Range: 'bytes=0-0'
                }
              : undefined,
          credentials: 'omit',
          redirect: 'follow',
          cache: 'default',
          signal: controller.signal
        }
      );

    const headers =
      readResponseHeaders(response);

    const totalFromRange =
      parseContentRangeTotal(
        response.headers.get(
          'content-range'
        )
      );

    const responseContentLength =
      totalFromRange
      ?? headers.responseContentLength;

    try {
      await response.body?.cancel();
    }
    catch {
      // metadata-only에서는 body를 저장하지 않으므로 취소 실패를 치명 오류로 보지 않는다.
    }

    return {
      ...headers,
      responseContentLength,
      ok: response.ok,
      metadataFetched:
        response.ok,
      bodyFetched: false,
      skipReason:
        response.ok
          ? 'metadata-only-original'
          : 'http-error',
      metadataMethod:
        methodMode,
      blobType: null,
      blobSize: null,
      contentLengthMatchesBlobSize:
        null,
      retryAfterMs:
        parseRetryAfterMs(
          response.headers.get(
            'retry-after'
          )
        ),
      attemptNumber: 0,
      error:
        response.ok
          ? null
          : `HTTP ${response.status}`
    };
  }
  catch (error) {
    const timedOut =
      error?.name === 'AbortError';

    return {
      ok: false,
      status: null,
      statusText: null,
      redirected: false,
      finalUrl: null,
      responseContentType: null,
      responseContentLength: null,
      contentDisposition: null,
      cacheControl: null,
      acceptRanges: null,
      metadataFetched: false,
      bodyFetched: false,
      skipReason:
        timedOut
          ? 'timeout'
          : 'fetch-exception',
      metadataMethod:
        methodMode,
      blobType: null,
      blobSize: null,
      contentLengthMatchesBlobSize:
        null,
      retryAfterMs: null,
      attemptNumber: 0,
      error:
        timedOut
          ? `timeout after ${timeoutMs}ms`
          : String(error)
    };
  }
  finally {
    clearTimeout(timeoutId);
  }
}


async function fetchBodyAttempt(
  url,
  maxBytesPerResource,
  timeoutMs,
  returnBodyBase64MaxBytes = 0,
  cacheMode = 'default'
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: 'GET',
          credentials: 'omit',
          redirect: 'follow',
          cache: cacheMode,
          signal: controller.signal
        }
      );

    const headers =
      readResponseHeaders(response);

    if (!response.ok) {
      try {
        await response.body?.cancel();
      }
      catch {
        // HTTP 오류가 본래 원인이므로 body 취소 실패는 별도 실패로 만들지 않는다.
      }

      return {
        ...headers,
        metadataFetched: false,
        bodyFetched: false,
        skipReason: 'http-error',
        blobType: null,
        blobSize: null,
        contentLengthMatchesBlobSize:
          null,
        retryAfterMs:
          parseRetryAfterMs(
            response.headers.get(
              'retry-after'
            )
          ),
        attemptNumber: 0,
        error:
          `HTTP ${response.status}`
      };
    }

    if (
      headers.responseContentLength
        !== null
      && headers.responseContentLength
        > maxBytesPerResource
    ) {
      try {
        await response.body?.cancel();
      }
      catch {
        // body 취소 실패는 skip 판정을 바꾸지 않는다.
      }

      return {
        ...headers,
        metadataFetched: true,
        bodyFetched: false,
        skipReason:
          'content-length-exceeds-limit',
        maxBytesPerResource,
        blobType: null,
        blobSize: null,
        contentLengthMatchesBlobSize:
          null,
        retryAfterMs: null,
        attemptNumber: 0,
        error: null
      };
    }

    const blob =
      await response.blob();


    let bodyBase64 = null;
    let bodyBase64Length = null;
    let bodyTransferAvailable = false;
    let bodyTransferEncoding = null;
    let bodyTransferSkipReason = null;

    if (
      returnBodyBase64MaxBytes > 0
      && blob.size
        <= returnBodyBase64MaxBytes
    ) {
      const arrayBuffer =
        await blob.arrayBuffer();

      bodyBase64 =
        arrayBufferToBase64(
          arrayBuffer
        );

      bodyBase64Length =
        bodyBase64.length;
      bodyTransferAvailable = true;
      bodyTransferEncoding =
        'base64';
    }
    else if (
      returnBodyBase64MaxBytes > 0
    ) {
      bodyTransferSkipReason =
        'resource-over-batch-transfer-limit';
    }

    return {
      ...headers,
      metadataFetched: true,
      bodyFetched: true,
      skipReason: null,
      blobType:
        blob.type || null,
      blobSize:
        blob.size,
      contentLengthMatchesBlobSize:
        headers.responseContentLength
          !== null
          ? headers.responseContentLength
            === blob.size
          : null,
      bodyTransferAvailable,
      bodyTransferEncoding,
      bodyTransferByteLength:
        bodyTransferAvailable
          ? blob.size
          : null,
      bodyTransferBase64Length:
        bodyBase64Length,
      bodyTransferSkipReason,
      bodyBase64,
      retryAfterMs: null,
      attemptNumber: 0,
      error: null
    };
  }
  catch (error) {
    const timedOut =
      error?.name === 'AbortError';

    return {
      ok: false,
      status: null,
      statusText: null,
      redirected: false,
      finalUrl: null,
      responseContentType: null,
      responseContentLength: null,
      contentDisposition: null,
      cacheControl: null,
      acceptRanges: null,
      metadataFetched: false,
      bodyFetched: false,
      skipReason:
        timedOut
          ? 'timeout'
          : 'fetch-exception',
      blobType: null,
      blobSize: null,
      contentLengthMatchesBlobSize:
        null,
      retryAfterMs: null,
      attemptNumber: 0,
      error:
        timedOut
          ? `timeout after ${timeoutMs}ms`
          : String(error)
    };
  }
  finally {
    clearTimeout(timeoutId);
  }
}


function readResponseHeaders(response) {
  const rawContentLength =
    response.headers.get(
      'content-length'
    );

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    redirected: response.redirected,
    finalUrl:
      response.url || null,
    responseContentType:
      response.headers.get(
        'content-type'
      ),
    responseContentLength:
      parsePositiveInteger(
        rawContentLength
      ),
    contentDisposition:
      response.headers.get(
        'content-disposition'
      ),
    cacheControl:
      response.headers.get(
        'cache-control'
      ),
    acceptRanges:
      response.headers.get(
        'accept-ranges'
      )
  };
}


function parseContentRangeTotal(value) {
  if (!value) {
    return null;
  }

  const match =
    value.match(/\/(\d+)$/);

  if (!match) {
    return null;
  }

  return parsePositiveInteger(
    match[1]
  );
}


function parseRetryAfterMs(value) {
  if (!value) {
    return null;
  }

  const seconds =
    Number(value);

  if (
    Number.isFinite(seconds)
    && seconds >= 0
  ) {
    return Math.round(
      seconds * 1000
    );
  }

  const dateMs =
    Date.parse(value);

  if (!Number.isFinite(dateMs)) {
    return null;
  }

  return Math.max(
    0,
    dateMs - Date.now()
  );
}


function chooseRetryDelayMs(
  retryAfterMs,
  baseDelayMs,
  attempt
) {
  const exponential =
    baseDelayMs
    * (2 ** attempt);

  const candidate =
    retryAfterMs !== null
      ? Math.max(
          retryAfterMs,
          exponential
        )
      : exponential;

  return Math.min(
    10000,
    Math.max(
      100,
      Math.round(candidate)
    )
  );
}


function isAllowedMediaUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url =
      new URL(value);

    if (
      url.protocol !== 'https:'
    ) {
      return false;
    }

    return [
      'arca.live',
      'ac.arca.live',
      'ac-o.arca.live'
    ].includes(
      url.hostname
    );
  }
  catch {
    return false;
  }
}


function parsePositiveInteger(value) {
  if (!value) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
    || number < 0
  ) {
    return null;
  }

  return Math.trunc(number);
}


function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number)
  ) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      number
    )
  );
}


function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}


async function mapWithConcurrency(
  items,
  concurrency,
  worker
) {
  const results =
    new Array(items.length);

  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index =
        nextIndex;

      nextIndex++;

      if (
        index >= items.length
      ) {
        return;
      }

      results[index] =
        await worker(
          items[index],
          index
        );
    }
  }

  const workerCount =
    Math.min(
      concurrency,
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount
      },
      () => runWorker()
    )
  );

  return results;
}
