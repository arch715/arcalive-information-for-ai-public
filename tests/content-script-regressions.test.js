'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const contentScriptPath = path.join(
  __dirname,
  '..',
  'AI_AI_Chrome',
  'content-script.js'
);

const contentScriptSource = fs.readFileSync(
  contentScriptPath,
  'utf8'
);

const serviceWorkerSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'AI_AI_Chrome',
    'service-worker.js'
  ),
  'utf8'
);

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'AI_AI_Chrome',
      'manifest.json'
    ),
    'utf8'
  )
);

function loadContentScript(overrides = {}) {
  const context = {
    console: {
      log() {},
      warn() {},
      error() {}
    },
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
      Buffer.from(value, 'base64').toString('binary'),
    setTimeout,
    clearTimeout,
    ...overrides
  };

  vm.createContext(context);
  vm.runInContext(
    contentScriptSource,
    context,
    { filename: contentScriptPath }
  );

  return context;
}

function createStatusDocument() {
  const elements = [];

  const parent = {
    appendChild(element) {
      element.isConnected = true;
      elements.push(element);
    }
  };

  return {
    elements,
    document: {
      body: parent,
      documentElement: parent,
      querySelector: () => null,
      createElement(tagName) {
        return {
          tagName,
          dataset: {},
          style: {},
          isConnected: false,
          textContent: '',
          setAttribute() {},
          remove() {
            this.isConnected = false;
          }
        };
      }
    }
  };
}

function makeOriginalProbeFixture(
  candidateCount
) {
  const resources = [];
  const results = [];
  const displayOriginalComparisons = [];

  for (
    let index = 0;
    index < candidateCount;
    index++
  ) {
    const displayResourceIndex =
      index * 2;

    const originalResourceIndex =
      displayResourceIndex + 1;

    resources.push(
      {
        resourceIndex:
          displayResourceIndex,
        roles: ['display-image'],
        representativeUrl:
          `https://ac.arca.live/display-${index}.webp`
      },
      {
        resourceIndex:
          originalResourceIndex,
        roles: ['original-image'],
        representativeUrl:
          `https://ac-o.arca.live/original-${index}.png`
      }
    );

    results.push({
      resourceIndex:
        displayResourceIndex,
      ok: true,
      responseContentLength: 1000,
      blobSize: 1000
    });

    displayOriginalComparisons.push({
      kind: 'image',
      displayResourceIndex,
      originalResourceIndex,
      assetHashCandidate:
        `asset-${index}`
    });
  }

  return {
    mediaDiscovery: { resources },
    mediaFetch: {
      results,
      displayOriginalComparisons
    }
  };
}

function makeOriginalProbeResult(
  resource,
  status
) {
  if (status === 206) {
    return {
      ...resource,
      ok: true,
      status: 206,
      contentType: 'image/png',
      contentRange:
        'bytes 0-65535/1737699',
      totalBytesFromContentRange:
        1737699,
      rangeHonored: true,
      bytesRead: 65536,
      dimensionStatus: 'success',
      width: 2560,
      height: 1600,
      pixelCount: 4096000,
      parser: 'png-prefix',
      skipReason: null,
      durationMs: 100,
      error: null
    };
  }

  return {
    ...resource,
    ok: false,
    status,
    contentType: null,
    contentRange: null,
    totalBytesFromContentRange: null,
    rangeHonored: false,
    bytesRead: 0,
    dimensionStatus: 'failed',
    width: null,
    height: null,
    pixelCount: null,
    parser: null,
    skipReason:
      `http-status-${status}`,
    durationMs: 100,
    error: `HTTP ${status}`
  };
}

async function runOriginalProbeScenario({
  candidateCount = 1,
  initialFailureStatus = 429,
  retryStatus = 206,
  requestDurations = []
} = {}) {
  let now = 0;
  let requestIndex = 0;

  const messages = [];
  const delays = [];
  const fixture =
    makeOriginalProbeFixture(
      candidateCount
    );

  const context = loadContentScript({
    performance: {
      now: () => now
    },
    setTimeout(callback, delayMs) {
      delays.push(delayMs);
      now += delayMs;
      callback();
      return delays.length;
    },
    clearTimeout() {},
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage(message) {
          messages.push(
            plain(message)
          );

          const isRetry =
            message.concurrency === 1;

          const response = {
            success: true,
            results:
              message.resources.map(
                resource => {
                  const status =
                    resource.sampleIndex === 0
                      ? isRetry
                        ? retryStatus
                        : initialFailureStatus
                      : 206;

                  return makeOriginalProbeResult(
                    resource,
                    status
                  );
                }
              )
          };

          now +=
            requestDurations[
              requestIndex
            ]
            ?? 100;

          requestIndex++;

          return response;
        }
      }
    }
  });

  context.mediaDiscovery =
    fixture.mediaDiscovery;
  context.mediaFetch =
    fixture.mediaFetch;
  context.warnings = [];

  const summary = await vm.runInContext(
    `probeOriginalImageDimensions({
      mediaDiscovery,
      mediaFetch,
      warnings
    })`,
    context
  );

  return {
    summary,
    messages,
    delays,
    warnings: context.warnings,
    now
  };
}

function textNode(text) {
  return {
    nodeType: 3,
    textContent: text
  };
}

function elementNode(tagName, childNodes = []) {
  return {
    nodeType: 1,
    tagName,
    childNodes,
    textContent: childNodes
      .map(child => child.textContent || '')
      .join(''),
    className: '',
    classList: {
      contains: () => false
    },
    dataset: {},
    outerHTML: `<${tagName.toLowerCase()}>`,
    getAttribute: () => null,
    querySelector: () => null,
    getBoundingClientRect: () => ({
      width: 0,
      height: 0
    })
  };
}

function imageNode({
  srcRaw = null,
  src = '',
  currentSrc = '',
  dataSrc = undefined,
  originalUrl = undefined,
  naturalWidth = 0,
  naturalHeight = 0,
  renderedWidth = 0,
  renderedHeight = 0
} = {}) {
  const image = elementNode('IMG');

  image.src = src;
  image.currentSrc = currentSrc;
  image.dataset = {
    src: dataSrc,
    originalurl: originalUrl
  };
  image.alt = '';
  image.title = '';
  image.naturalWidth = naturalWidth;
  image.naturalHeight = naturalHeight;
  image.getAttribute = name =>
    name === 'src'
      ? srcRaw
      : null;
  image.getBoundingClientRect = () => ({
    width: renderedWidth,
    height: renderedHeight
  });

  return image;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function aiConsumerFixture() {
  const articleOriginalText = [
    'C:\\Users\\FAKE_ARTICLE_AUTHOR\\private-looking-text.txt',
    'token=FAKE_AUTHOR_CONTENT'
  ].join('\n');

  const signedMediaUrl =
    'https://ac.arca.live/fake.webp?key=FAKE_SIGNED_RESOURCE_OBSERVATION';

  return {
    extraction: {
      version:
        '0.3.30-ai-consumer-payload-1',
      generatedAt:
        '2099-01-01T00:00:00.000Z',
      durationMs: 1234,
      source:
        'C:\\Users\\FAKE_LOCAL_USER\\AI_AI\\content-script.js'
    },
    post: {
      channel: 'fixture',
      postNumber: '123',
      title: 'fixture post',
      author: {
        name: 'FAKE_POST_AUTHOR'
      }
    },
    stats: {
      views: 10
    },
    preview: {
      defaultImage: {
        url: signedMediaUrl
      }
    },
    presentation: {
      spoiler: {
        alertCount: 0
      }
    },
    series: {
      hasSeries: false,
      items: [],
      currentIndex: null
    },
    body: {
      text: articleOriginalText,
      sequence: [
        {
          type: 'text',
          text: articleOriginalText
        }
      ],
      unknownObservations: [
        {
          reason:
            'fixture-unknown-kept-for-context',
          text: 'unknown original observation'
        }
      ]
    },
    comments: {
      summary: {
        status: 'completed',
        commentCollectionDurationMs: 200,
        totalCommentPageFetchDurationMs: 150
      },
      items: [
        {
          commentId: 'comment-1',
          parentCommentId: null,
          author: {
            name: 'FAKE_COMMENT_AUTHOR'
          },
          text:
            `comment original: ${articleOriginalText}`,
          completeness: {
            status: 'complete'
          }
        }
      ],
      relationAudit: [
        {
          commentId: 'comment-1',
          parentCommentId: null,
          status: 'root'
        }
      ],
      fetchReports: [
        {
          page: 1,
          ok: true,
          status: 200,
          durationMs: 150,
          extractedItems: 1
        }
      ]
    },
    media: {
      policy: {
        workspacePath:
          'C:\\Users\\FAKE_LOCAL_USER\\AI_AI\\runtime'
      },
      discovery: {
        occurrenceCount: 1,
        uniqueResourceCount: 1,
        fetchEligibleCount: 1,
        occurrences: [
          {
            occurrenceIndex: 7,
            resourceIndex: 3,
            source: 'body.sequence[0]',
            role: 'display-image',
            url: signedMediaUrl,
            packageResourceId: 'media-0000',
            packageFileName:
              'media/media-0000.webp'
          }
        ],
        resources: [
          {
            resourceIndex: 3,
            resourceKey: signedMediaUrl,
            representativeUrl: signedMediaUrl,
            roles: ['display-image'],
            occurrences: [
              {
                occurrenceIndex: 7,
                source: 'body.sequence[0]',
                role: 'display-image'
              }
            ],
            packageResourceId: 'media-0000',
            packageFileName:
              'media/media-0000.webp',
          }
        ]
      },
      fetch: {
        status: 'partial',
        bodyBatchSize: 80,
        originalMetadataConcurrency: 1,
        originalMetadataInterBatchDelayMs: 500,
        batchSummaries: [
          {
            kind: 'body-priority',
            durationMs: 50,
            failureCount: 1,
            error: 'fixture batch partial'
          }
        ],
        results: [
          {
            resourceIndex: 3,
            resourceKey: signedMediaUrl,
            requestedUrl: signedMediaUrl,
            finalUrl: signedMediaUrl,
            ok: true,
            status: 200,
            responseContentType: 'image/webp',
            blobType: 'image/webp',
            blobSize: 321,
            bodyFetched: true,
            bodyTransferAvailable: true,
            bodyTransferByteLength: 321,
            bodyTransferEncoding: 'base64',
            bodyTransferBase64Length: 428,
            durationMs: 40,
          },
          {
            resourceIndex: 4,
            resourceKey: 'failed-resource',
            requestedUrl:
              'https://ac.arca.live/failure.gif',
            ok: false,
            status: 429,
            responseContentType: 'image/gif',
            blobSize: null,
            bodyFetched: false,
            bodyTransferAvailable: false,
            skipReason: 'http-status-429',
            error: 'HTTP 429',
            durationMs: 60
          }
        ]
      },
      originalDimensionProbe: {
        status: 'partial',
        durationMs: 80,
        batchSize: 4,
        concurrency: 4,
        results: [
          {
            resourceIndex: 8,
            dimensionStatus: 'success',
            width: 800,
            height: 600,
            contentType: 'image/png',
            rangeReportedTotalBytes: 900,
            durationMs: 20
          }
        ]
      },
      originalGifFetch: {
        status: 'partial',
        results: [
          {
            resourceIndex: 9,
            status: 503,
            responseContentType: 'image/gif',
            actualBytes: null,
            bodyFetched: false,
            skipReason: 'http-status-503',
            error: 'HTTP 503'
          }
        ]
      },
      originalRangeDimensionComparisons: {
        summary: {
          status: 'completed'
        },
        items: [
          {
            displayResourceIndex: 3,
            originalResourceIndex: 8,
            pixelCountRatioOriginalToDisplay: 1.1
          }
        ]
      },
      originalPolicySelection: {
        summary: {
          status: 'skipped',
          skippedCount: 1
        },
        selected: [],
        skipped: [
          {
            originalResourceIndex: 8,
            displayResourceIndex: 3,
            pixelRatio: 1.1,
            originalBytes: 900,
            reason:
              'pixel-ratio-below-1.25'
          }
        ]
      },
      conditionalOriginalFetch: {
        status: 'partial',
        results: [
          {
            originalResourceIndex: 8,
            displayResourceIndex: 3,
            status: null,
            bodyFetched: false,
            actualBytes: null,
            skipReason:
              'skipped-technical-time-budget'
          }
        ]
      },
      packageTest: {
        status: 'ready',
        fileName: 'fixture.zip',
        messageTransferEncoding:
          'base64-body-transfer-map-test',
        resourceCount: 1,
        totalMediaBytes: 321,
        resources: [
          {
            resourceId: 'media-0000',
            sourceResourceIndex: 3,
            resourceKey: signedMediaUrl,
            requestedUrl: signedMediaUrl,
            finalUrl: signedMediaUrl,
            mimeType: 'image/webp',
            bytes: 321,
            imageDimensions: {
              status: 'success',
              width: 40,
              height: 30,
              mimeType: 'image/webp'
            },
            occurrences: [
              {
                occurrenceIndex: 7,
                source: 'body.sequence[0]',
                role: 'display-image'
              }
            ],
            fileName:
              'media/media-0000.webp',
            base64Length: 428,
            transferSource: 'fixture-transfer',
            packageRefetched: false,
          }
        ],
        occurrenceLinks: [
          {
            occurrenceIndex: 7,
            resourceId: 'media-0000',
            fileName:
              'media/media-0000.webp'
          }
        ],
        skippedResources: [
          {
            resourceIndex: 4,
            reason: 'body-transfer-unavailable',
            transferSkipReason:
              'content-length-exceeds-limit'
          }
        ]
      },
      displayOriginalTechnicalComparisons: {
        summary: {
          status: 'completed'
        },
        items: [
          {
            displayResourceIndex: 3,
            originalResourceIndex: 8,
            byteSizeComparable: true,
            pixelDimensionsComparable: true
          }
        ]
      },
    },
    diagnostics: {
      warnings: [
        {
          code: 'FIXTURE_WARNING',
          reason: 'body-transfer-unavailable'
        }
      ],
      errors: [
        {
          stage: 'fixture',
          message: 'fixture error'
        }
      ],
      holds: [
        'FAKE_SESSION_ID at http://localhost:12345/',
        'C:\\Users\\FAKE_LOCAL_USER\\AI_AI\\hold.txt'
      ]
    },
    summary: {
      post: {
        title: 'fixture post'
      },
      media: {
        occurrenceCount: 1,
        failureCount: 1,
        originalDimensionProbeDurationMs: 80
      },
      warnings: 1,
      errors: 1,
      durationMs: 1234
    }
  };
}

test('AI consumer payload preserves article content and media delivery relations', () => {
  const context = loadContentScript();
  const fixture = aiConsumerFixture();

  context.fixture = fixture;

  const payload = plain(
    vm.runInContext(
      'buildAiConsumerPayload(fixture)',
      context
    )
  );

  assert.deepEqual(payload.post.author, fixture.post.author);
  assert.deepEqual(
    payload.comments.items[0].author,
    fixture.comments.items[0].author
  );
  assert.equal(payload.body.text, fixture.body.text);
  assert.equal(
    payload.comments.items[0].text,
    fixture.comments.items[0].text
  );
  assert.equal(
    payload.body.unknownObservations[0].reason,
    'fixture-unknown-kept-for-context'
  );

  const occurrence =
    payload.media.discovery.occurrences[0];
  const resource =
    payload.media.discovery.resources[0];
  const packageResource =
    payload.media.packageTest.resources[0];
  const packageLink =
    payload.media.packageTest.occurrenceLinks[0];

  assert.equal(occurrence.resourceIndex, 3);
  assert.equal(resource.resourceIndex, 3);
  assert.equal(
    resource.packageResourceId,
    packageResource.resourceId
  );
  assert.equal(
    occurrence.packageFileName,
    packageResource.fileName
  );
  assert.equal(
    packageLink.occurrenceIndex,
    occurrence.occurrenceIndex
  );
  assert.equal(
    packageLink.fileName,
    packageResource.fileName
  );
  assert.equal(packageResource.mimeType, 'image/webp');
  assert.equal(packageResource.bytes, 321);
  assert.deepEqual(
    packageResource.imageDimensions,
    fixture.media.packageTest
      .resources[0].imageDimensions
  );

  const fetched = payload.media.fetch.results;

  assert.equal(fetched[0].status, 200);
  assert.equal(
    fetched[0].responseContentType,
    'image/webp'
  );
  assert.equal(fetched[0].blobSize, 321);
  assert.equal(fetched[0].bodyFetched, true);
  assert.equal(fetched[1].status, 429);
  assert.equal(fetched[1].skipReason, 'http-status-429');
  assert.equal(fetched[1].error, 'HTTP 429');
  assert.equal(
    payload.media.originalDimensionProbe
      .results[0].width,
    800
  );
  assert.equal(
    payload.media.originalGifFetch
      .results[0].skipReason,
    'http-status-503'
  );
  assert.equal(
    payload.media.conditionalOriginalFetch
      .results[0].skipReason,
    'skipped-technical-time-budget'
  );
  assert.equal(
    payload.media
      .displayOriginalTechnicalComparisons
      .items[0].originalResourceIndex,
    8
  );
  assert.deepEqual(
    payload.diagnostics.warnings,
    fixture.diagnostics.warnings
  );
  assert.deepEqual(
    payload.diagnostics.errors,
    fixture.diagnostics.errors
  );
});

test('AI consumer payload keeps fake private-looking article text and signed URL but drops fake local runtime values', () => {
  const context = loadContentScript();
  const fixture = aiConsumerFixture();

  context.fixture = fixture;

  const payloadText = JSON.stringify(
    plain(
      vm.runInContext(
        'buildAiConsumerPayload(fixture)',
        context
      )
    )
  );

  assert.match(
    payloadText,
    /C:\\\\Users\\\\FAKE_ARTICLE_AUTHOR\\\\private-looking-text\.txt/
  );
  assert.match(payloadText, /token=FAKE_AUTHOR_CONTENT/);
  assert.match(
    payloadText,
    /key=FAKE_SIGNED_RESOURCE_OBSERVATION/
  );
  assert.doesNotMatch(payloadText, /FAKE_LOCAL_USER/);
  assert.doesNotMatch(payloadText, /localhost:12345/);
  assert.doesNotMatch(payloadText, /FAKE_SESSION_ID/);
});

test('AI consumer payload removes development runtime fields and both download paths serialize it', async () => {
  let downloadedBlob = null;

  class FixtureUrl extends URL {}

  FixtureUrl.createObjectURL = blob => {
    downloadedBlob = blob;
    return 'blob:fixture';
  };
  FixtureUrl.revokeObjectURL = () => {};

  const context = loadContentScript({
    URL: FixtureUrl,
    document: {
      querySelector: () => null,
      createElement: () => ({
        style: {},
        click() {},
        remove() {}
      }),
      body: {
        appendChild() {}
      }
    },
    setTimeout(callback) {
      callback();
      return 0;
    }
  });

  const fixture = aiConsumerFixture();
  context.fixture = fixture;

  const expected = plain(
    vm.runInContext(
      'buildAiConsumerPayload(fixture)',
      context
    )
  );

  assert.deepEqual(
    expected.extraction,
    {
      version:
        '0.3.30-ai-consumer-payload-1'
    }
  );
  assert.equal('policy' in expected.media, false);
  assert.equal('relay' in expected.media, false);
  assert.equal(
    'commentCollectionDurationMs'
      in expected.comments.summary,
    false
  );
  assert.equal(
    'totalCommentPageFetchDurationMs'
      in expected.comments.summary,
    false
  );
  assert.equal(
    'durationMs'
      in expected.comments.fetchReports[0],
    false
  );
  assert.equal(
    'durationMs'
      in expected.media.fetch.results[0],
    false
  );
  assert.equal(
    'bodyBatchSize' in expected.media.fetch,
    false
  );
  assert.equal(
    'batchSize'
      in expected.media.originalDimensionProbe,
    false
  );
  assert.equal(
    'concurrency'
      in expected.media.originalDimensionProbe,
    false
  );
  assert.equal(
    'base64Length'
      in expected.media.packageTest.resources[0],
    false
  );
  assert.equal(
    'messageTransferEncoding'
      in expected.media.packageTest,
    false
  );
  assert.equal('holds' in expected.diagnostics, false);
  assert.equal('durationMs' in expected.summary, false);

  assert.equal(
    fixture.extraction.generatedAt,
    '2099-01-01T00:00:00.000Z'
  );
  assert.equal(fixture.diagnostics.holds.length, 2);

  await vm.runInContext(
    'downloadJsonResult(fixture)',
    context
  );

  const fallbackPayload =
    JSON.parse(await downloadedBlob.text());

  assert.deepEqual(fallbackPayload, expected);

  context.capturedZipFiles = null;

  await vm.runInContext(
    `createZipStore = files => {
      capturedZipFiles = files;
      return new Uint8Array([1]);
    };
    downloadBinaryFile = () => {};
    downloadMediaPackageZipTest(
      fixture,
      [],
      'fixture.zip'
    );`,
    context
  );

  const zipArticlePayload = JSON.parse(
    Buffer.from(
      context.capturedZipFiles[0].data
    ).toString('utf8')
  );

  assert.deepEqual(zipArticlePayload, expected);
});

test('AI consumer payload preserves technical reasons for originals omitted from the package', () => {
  const context = loadContentScript();
  const fixture = aiConsumerFixture();

  context.fixture = fixture;

  const payload = plain(
    vm.runInContext(
      'buildAiConsumerPayload(fixture)',
      context
    )
  );

  assert.equal(
    payload.media.originalPolicySelection
      .skipped[0].reason,
    'pixel-ratio-below-1.25'
  );
  assert.equal(
    payload.media.originalPolicySelection
      .skipped[0].originalResourceIndex,
    8
  );
  assert.equal(
    payload.media.packageTest
      .skippedResources[0].reason,
    'body-transfer-unavailable'
  );
  assert.equal(
    payload.media.packageTest
      .skippedResources[0]
      .transferSkipReason,
    'content-length-exceeds-limit'
  );
});


test('production cleanup removes legacy Remote Delivery and localhost hooks', () => {
  const combinedSource = [
    contentScriptSource,
    serviceWorkerSource
  ].join('\n');

  for (const token of [
    'AI_AI_REMOTE_DELIVERY_ENABLED',
    'AI_AI_RELAY_BEGIN',
    'AI_AI_RELAY_FINALIZE',
    'AI_AI_RELAY_CONTROL_BASE',
    'buildRemoteDeliveryDisabledState',
    'relayUpload'
  ]) {
    assert.equal(
      combinedSource.includes(token),
      false,
      `legacy Remote Delivery token remains: ${token}`
    );
  }

  assert.equal(
    manifest.host_permissions.includes(
      'http://127.0.0.1/*'
    ),
    false
  );
});

test('production cleanup removes obsolete experiment-only hooks and unnecessary activeTab permission', () => {
  const combinedSource = [
    contentScriptSource,
    serviceWorkerSource
  ].join('\n');

  for (const token of [
    'AI_AI_FETCH_MEDIA_FILE_TEST',
    'fetchMediaFileTest',
    'buildBatchFailureResults',
    'selectSpreadSamples',
    'fetchOriginalBodiesForPackageTest',
    'validateOriginalPolicySamples',
    'buildOriginalValueProbe',
    'pickAiConsumerFields',
    'appendOriginalBodyTestDiagnostics',
    'buildOriginalPolicyExperiment',
    'originalPolicyExperiment',
    'originalPolicyFullFetchValidation',
    'originalValueProbe',
    'originalBodyTest',
    'packageOriginalBodyTest'
  ]) {
    assert.equal(
      combinedSource.includes(token),
      false,
      `obsolete production token remains: ${token}`
    );
  }

  assert.equal(
    (manifest.permissions ?? []).includes('activeTab'),
    false
  );
});


test('production cleanup keeps lifecycle status while removing obsolete runtime noise', () => {
  const combinedSource = [
    contentScriptSource,
    serviceWorkerSource
  ].join('\n');

  assert.doesNotMatch(
    contentScriptSource,
    /\bpolicy:\s*\{/
  );

  for (const marker of [
    'legacyMaxItems',
    'legacyItemLimitRemoved',
    'skippedByItemLimit',
    'MEDIA_FETCH_ITEM_LIMIT_REACHED'
  ]) {
    assert.equal(
      combinedSource.includes(marker),
      false,
      marker
    );
  }

  for (const marker of [
    'aiAiRunInProgress',
    'showAiAiProcessingToast',
    'showAiAiFinalToast',
    '게시글 처리 중…',
    '저장 완료',
    '다운로드 시작됨',
    '사용자 지정 폴더 사용 불가 → 기본 다운로드',
    'extraction-already-running'
  ]) {
    assert.equal(
      contentScriptSource.includes(marker),
      true,
      `lifecycle UI marker missing: ${marker}`
    );
  }

  assert.doesNotMatch(
    combinedSource,
    /console\.log\s*\(/
  );

  for (const marker of [
    'content-script.js 로드됨',
    '미디어 우선순위 batch 검증 시작',
    'media batch 시작',
    'media batch 완료',
    '미디어 우선순위 batch 검증 완료',
    'body 전달 Map 데이터로 ZIP 구성',
    'ZIP 패키지 생성 완료',
    '사용자 지정 폴더 저장 완료',
    'Service Worker 시작',
    'content script 응답:'
  ]) {
    assert.equal(
      combinedSource.includes(marker),
      false,
      marker
    );
  }
});


test('AI_AI_RUN shows processing state, blocks a duplicate run, and reports download fallback', async () => {
  const statusDocument =
    createStatusDocument();

  let messageListener = null;

  const context = loadContentScript({
    document: statusDocument.document,
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          }
        }
      }
    }
  });

  let resolveRun;

  context.testRunPromise =
    new Promise(resolve => {
      resolveRun = resolve;
    });

  vm.runInContext(
    'runExtraction = () => testRunPromise',
    context
  );

  const firstResponses = [];
  const firstReturn = messageListener(
    { type: 'AI_AI_RUN' },
    {},
    response => firstResponses.push(response)
  );

  assert.equal(firstReturn, true);
  assert.equal(
    statusDocument.elements.length,
    1
  );
  assert.match(
    statusDocument.elements[0].textContent,
    /게시글 처리 중/
  );

  const duplicateResponses = [];
  const duplicateReturn = messageListener(
    { type: 'AI_AI_RUN' },
    {},
    response =>
      duplicateResponses.push(response)
  );

  assert.equal(duplicateReturn, false);
  assert.equal(
    duplicateResponses[0].status,
    'already-running'
  );
  assert.equal(
    duplicateResponses[0].reason,
    'extraction-already-running'
  );

  resolveRun({
    result: {
      summary: { status: 'complete' }
    },
    fileName: 'AI_AI_fixture.zip',
    delivery: {
      artifactKind: 'package-zip',
      save: {
        status: 'complete',
        route: 'default',
        reason:
          'query-permission-prompt-required'
      }
    }
  });

  await new Promise(resolve =>
    setImmediate(resolve)
  );

  assert.equal(firstResponses[0].success, true);
  assert.match(
    statusDocument.elements[0].textContent,
    /다운로드 시작됨/
  );
  assert.match(
    statusDocument.elements[0].textContent,
    /사용자 지정 폴더 사용 불가 → 기본 다운로드/
  );
  assert.equal(
    vm.runInContext(
      'aiAiRunInProgress',
      context
    ),
    false
  );

  vm.runInContext(
    'removeAiAiToast()',
    context
  );
});


test('original dimension probe retries only an HTTP 429 once and can recover inside the 8 second budget', async () => {
  const scenario =
    await runOriginalProbeScenario();

  assert.equal(
    scenario.messages.length,
    2
  );
  assert.equal(
    scenario.messages[0].concurrency,
    2
  );
  assert.equal(
    scenario.messages[1].concurrency,
    1
  );
  assert.equal(
    scenario.messages[1].resources.length,
    1
  );
  assert.ok(
    scenario.messages[1].timeoutMs
      <= 2500
  );

  assert.equal(
    scenario.summary.retryEnabled,
    true
  );
  assert.equal(
    scenario.summary.retryRoundCount,
    1
  );
  assert.equal(
    scenario.summary.retryRecoveredCount,
    1
  );
  assert.equal(
    scenario.summary
      .retryRecoveredFrom429Count,
    1
  );
  assert.equal(
    scenario.summary.failureCount,
    0
  );
  assert.equal(
    scenario.summary.results[0]
      .attemptCount,
    2
  );
  assert.equal(
    scenario.summary.results[0]
      .attemptHistory[0].status,
    429
  );
  assert.equal(
    scenario.summary.results[0].status,
    206
  );
  assert.ok(scenario.now <= 8000);
});


test('original dimension 429 recovery never starts after the 8 second budget is exhausted', async () => {
  const scenario =
    await runOriginalProbeScenario({
      candidateCount: 6,
      requestDurations: [
        2500,
        2500,
        2500
      ]
    });

  assert.equal(
    scenario.messages.length,
    3
  );
  assert.equal(
    scenario.summary.timeBudgetExceeded,
    true
  );
  assert.equal(
    scenario.summary
      .retryRoundSummaries[0]
      .requestedCount,
    0
  );
  assert.equal(
    scenario.summary
      .retryRoundSummaries[0]
      .skipped,
    'probe-time-budget-exceeded'
  );
  assert.equal(
    scenario.summary.results[0].status,
    429
  );
  assert.equal(
    scenario.summary.results[0]
      .attemptCount,
    1
  );
  assert.ok(scenario.now <= 8000);
});


test('permanent HTTP 429 is retained after one retry while 5xx is not retried', async () => {
  const permanent429 =
    await runOriginalProbeScenario({
      retryStatus: 429
    });

  assert.equal(
    permanent429.messages.length,
    2
  );
  assert.equal(
    permanent429.summary.failureCount,
    1
  );
  assert.equal(
    permanent429.summary.rateLimitedCount,
    1
  );
  assert.equal(
    permanent429.summary
      .retryRecoveredCount,
    0
  );
  assert.equal(
    permanent429.summary.results[0]
      .attemptCount,
    2
  );
  assert.equal(
    permanent429.summary.results[0]
      .attemptHistory[1].status,
    429
  );

  const http503 =
    await runOriginalProbeScenario({
      initialFailureStatus: 503
    });

  assert.equal(http503.messages.length, 1);
  assert.equal(
    http503.summary.results[0].status,
    503
  );
  assert.equal(
    http503.summary.results[0]
      .attemptCount,
    1
  );
});


test('conditional original keeps a 10 second timeout failure without retrying or failing the package path', async () => {
  let now = 0;

  const messages = [];

  const context = loadContentScript({
    performance: {
      now: () => now
    },
    setTimeout(callback, delayMs) {
      now += delayMs;
      callback();
      return 1;
    },
    clearTimeout() {},
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage(message) {
          messages.push(
            plain(message)
          );

          now += message.bodyTimeoutMs;

          return {
            success: true,
            results: [
              {
                ok: false,
                status: null,
                attempts: 1,
                rateLimitEncountered:
                  false,
                bodyFetched: false,
                bodyTransferAvailable:
                  false,
                skipReason: 'timeout',
                error:
                  `timeout after ${message.bodyTimeoutMs}ms`
              }
            ]
          };
        }
      }
    }
  });

  context.selection = {
    selected: [
      {
        selectionOrder: 0,
        originalResourceIndex: 3,
        displayResourceIndex: 2,
        assetHashCandidate:
          'fixture-original',
        resourceKey:
          'fixture-original-resource',
        url:
          'https://ac-o.arca.live/fixture.png',
        tier: 1,
        tierName: 'high-value',
        pixelRatio: 4,
        originalBytes: 1737699,
        rangeContentType: 'image/png'
      }
    ]
  };
  context.warnings = [];

  const result = await vm.runInContext(
    `fetchConditionalOriginalBodies({
      selection,
      warnings
    })`,
    context
  );

  assert.equal(messages.length, 1);
  assert.equal(
    messages[0].bodyTimeoutMs,
    10000
  );
  assert.equal(messages[0].retry429Count, 0);
  assert.equal(messages[0].cacheMode, 'no-store');
  assert.equal(result.summary.status, 'partial');
  assert.equal(result.summary.successCount, 0);
  assert.equal(result.summary.failureCount, 1);
  assert.equal(result.summary.timedOutCount, 1);
  assert.equal(result.summary.retryEnabled, false);
  assert.equal(
    result.summary.maxRequestTimeoutMs,
    10000
  );
  assert.equal(
    result.summary.results[0].skipReason,
    'timeout'
  );
  assert.equal(
    result.summary.results[0].error,
    'timeout after 10000ms'
  );
  assert.equal(result.transferMap.size, 0);
  assert.ok(result.summary.durationMs <= 15000);
});


test('AI consumer payload removes v0.3.30 execution noise while preserving completeness evidence', () => {
  const context = loadContentScript();
  const fixture = aiConsumerFixture();

  fixture.summary.comments = {
    status: 'completed',
    totalComments: 1,
    commentCollectionDurationMs: 200,
    totalCommentPageFetchDurationMs: 150
  };

  Object.assign(
    fixture.summary.media,
    {
      originalDimensionProbeBatchCount: 2,
      originalDimensionProbeRetryRecoveredCount: 1,
      conditionalOriginalFetchRetryRecoveredCount: 1,
      packageTestRefetchCount: 0,
      packageTestUsesBodyTransferMapOnly: true,
      bodyTransferAvailableCount: 1,
      bodyTransferBytes: 321,
      retryCount: 3,
      timedOutCount: 1,
      rateLimitedCount: 1,
      packageTestResourceCount: 1
    }
  );

  Object.assign(
    fixture.media.fetch,
    {
      requestedResources: 2,
      completedResources: 2,
      successCount: 1,
      failureCount: 1,
      bodyBatchCount: 1,
      originalMetadataBatchCount: 1,
      bodyPriorityCompletedBeforeOriginalMetadata:
        true,
      retryCount: 2
    }
  );

  Object.assign(
    fixture.media.fetch.results[0],
    {
      fetchDurationMs: 41,
      cacheControl: 'private, max-age=0',
      acceptRanges: 'bytes',
      retryAfterMs: 750
    }
  );

  Object.assign(
    fixture.media.originalDimensionProbe,
    {
      selectionStrategy:
        'fixture-range-probe-strategy',
      candidateCount: 3,
      selectedCount: 3,
      completedCount: 3,
      batchCount: 1,
      plannedBatchCount: 1,
      batchSummaries: [
        {
          requestedCount: 3,
          durationMs: 80
        }
      ],
      requestTimeoutMs: 2500,
      retryEnabled: true,
      retryRoundCount: 1,
      retryRoundSummaries: [
        {
          recoveredCount: 1
        }
      ],
      retryRecoveredCount: 1,
      retryRecoveredFrom429Count: 1,
      prefixBytesRequested: 65536,
      interpretationApplied: false,
      automaticInclusionDecisionApplied:
        false,
      rangeHonoredCount: 1,
      failureCount: 2,
      timedOutCount: 1,
      rateLimitedCount: 1,
      timeBudgetExceeded: true,
      budgetSkippedCount: 0
    }
  );

  Object.assign(
    fixture.media.originalDimensionProbe.results[0],
    {
      status: 206,
      rangeHonored: true,
      contentRange:
        'bytes 0-65535/900',
      totalBytesFromContentRange: 900,
      pixelCount: 480000,
      skipReason: null,
      error: null,
      fetchDurationMs: 20
    }
  );

  fixture.media.originalDimensionProbe
    .results.push(
      {
        resourceIndex: 10,
        status: null,
        rangeHonored: false,
        dimensionStatus: 'failed',
        skipReason: 'timeout',
        error: 'request timed out',
        fetchDurationMs: 2500
      },
      {
        resourceIndex: 11,
        status: 429,
        rateLimitEncountered: true,
        rangeHonored: false,
        dimensionStatus: 'failed',
        skipReason: 'http-status-429',
        error: 'HTTP 429',
        retryAfterMs: 1000
      }
    );

  Object.assign(
    fixture.media
      .originalRangeDimensionComparisons
      .summary,
    {
      interpretationApplied: false,
      automaticInclusionDecisionApplied:
        false
    }
  );

  Object.assign(
    fixture.media.originalGifFetch,
    {
      maxRequestTimeoutMs: 10000,
      retryEnabled: false,
      cacheMode: 'no-store',
      concurrency: 1,
      maxBytesPerResource:
        16 * 1024 * 1024,
      maxTotalBytes:
        32 * 1024 * 1024,
      timeBudgetMs: 15000,
      timeBudgetExceeded: true,
      skipped: [
        {
          resourceIndex: 12,
          expectedBytes:
            17 * 1024 * 1024,
          maxBytesPerResource:
            16 * 1024 * 1024,
          reason:
            'original-gif-over-resource-byte-limit'
        }
      ]
    }
  );

  Object.assign(
    fixture.media.conditionalOriginalFetch,
    {
      selectedCount: 1,
      attemptedCount: 0,
      successCount: 0,
      failureCount: 1,
      transferredBytes: 0,
      sizeMismatchCount: 0,
      timeBudgetExceeded: true,
      cacheMode: 'no-store',
      retryEnabled: false,
      retryRecoveredCount: 0,
      maxRequestTimeoutMs: 10000
    }
  );

  Object.assign(
    fixture.media.originalPolicySelection.summary,
    {
      policyVersion:
        'tiered-pixel-gain-budget-v1',
      ranking:
        'fixture-ranking-strategy',
      automaticInclusionDecisionApplied:
        true,
      semanticInterpretationApplied:
        false,
      baseMediaBytes: 321,
      targetMediaBytes:
        120 * 1024 * 1024,
      hardMediaBytes:
        128 * 1024 * 1024,
      availableOriginalBudgetBytes:
        120 * 1024 * 1024 - 321
    }
  );

  Object.assign(
    fixture.media.packageTest,
    {
      zipCompression: 'store',
      selectionMode:
        'fixture-internal-selection',
      packageRefetchCount: 0,
      packageUsesBodyTransferMapOnly: true,
      bodyTransferAvailableCount: 1,
      bodyTransferBytes: 321,
      linkedOccurrenceCount: 1,
      skippedResourceCount: 1,
      allSelectedCandidatesPackaged: true,
      allEligibleBodyResourcesSelected: true,
      hardLimitSatisfied: true
    }
  );

  Object.assign(
    fixture.media
      .displayOriginalTechnicalComparisons
      .summary,
    {
      interpretationApplied: false
    }
  );

  Object.assign(
    fixture.media
      .displayOriginalTechnicalComparisons
      .items[0],
    {
      display: {
        bytes: 321,
        mimeType: 'image/webp',
        width: 40,
        height: 30,
        packageResourceId: 'media-0000',
        fetchDurationMs: 40
      },
      original: {
        bytes: 900,
        mimeType: 'image/png',
        width: 800,
        height: 600,
        packageResourceId: null,
        fetchDurationMs: 20,
        skipReason: 'timeout',
        error: 'request timed out'
      }
    }
  );

  context.fixture = fixture;

  const payload = plain(
    vm.runInContext(
      'buildAiConsumerPayload(fixture)',
      context
    )
  );

  assert.equal(
    'commentCollectionDurationMs'
      in payload.summary.comments,
    false
  );
  assert.equal(
    'totalCommentPageFetchDurationMs'
      in payload.summary.comments,
    false
  );
  assert.equal(
    payload.summary.comments.status,
    'completed'
  );
  assert.equal(
    payload.summary.comments.totalComments,
    1
  );

  for (
    const key of [
      'originalDimensionProbeBatchCount',
      'originalDimensionProbeRetryRecoveredCount',
      'conditionalOriginalFetchRetryRecoveredCount',
      'packageTestRefetchCount',
      'packageTestUsesBodyTransferMapOnly',
      'bodyTransferAvailableCount',
      'bodyTransferBytes',
      'retryCount'
    ]
  ) {
    assert.equal(
      key in payload.summary.media,
      false,
      key
    );
  }

  assert.equal(payload.summary.media.timedOutCount, 1);
  assert.equal(payload.summary.media.rateLimitedCount, 1);
  assert.equal(
    payload.summary.media.packageTestResourceCount,
    1
  );

  for (
    const key of [
      'bodyBatchCount',
      'originalMetadataBatchCount',
      'bodyPriorityCompletedBeforeOriginalMetadata',
      'legacyMaxItems',
      'legacyItemLimitRemoved',
      'batchSummaries',
      'retryCount'
    ]
  ) {
    assert.equal(
      key in payload.media.fetch,
      false,
      key
    );
  }

  for (
    const key of [
      'durationMs',
      'fetchDurationMs',
      'cacheControl',
      'acceptRanges',
      'retryAfterMs'
    ]
  ) {
    assert.equal(
      key in payload.media.fetch.results[0],
      false,
      key
    );
  }

  assert.equal(payload.media.fetch.requestedResources, 2);
  assert.equal(payload.media.fetch.completedResources, 2);
  assert.equal(payload.media.fetch.successCount, 1);
  assert.equal(payload.media.fetch.failureCount, 1);
  assert.equal(
    payload.media.fetch.results[1].status,
    429
  );
  assert.equal(
    payload.media.fetch.results[1].skipReason,
    'http-status-429'
  );

  const probe =
    payload.media.originalDimensionProbe;

  for (
    const key of [
      'selectionStrategy',
      'batchCount',
      'plannedBatchCount',
      'batchSummaries',
      'requestTimeoutMs',
      'retryEnabled',
      'retryRoundCount',
      'retryRoundSummaries',
      'retryRecoveredCount',
      'retryRecoveredFrom429Count',
      'prefixBytesRequested',
      'interpretationApplied',
      'automaticInclusionDecisionApplied'
    ]
  ) {
    assert.equal(key in probe, false, key);
  }

  assert.equal(probe.candidateCount, 3);
  assert.equal(probe.selectedCount, 3);
  assert.equal(probe.completedCount, 3);
  assert.equal(probe.rangeHonoredCount, 1);
  assert.equal(probe.timeBudgetExceeded, true);
  assert.equal(probe.results[0].status, 206);
  assert.equal(probe.results[0].rangeHonored, true);
  assert.equal(
    probe.results[0].contentRange,
    'bytes 0-65535/900'
  );
  assert.equal(probe.results[0].width, 800);
  assert.equal(probe.results[0].height, 600);
  assert.equal(probe.results[0].pixelCount, 480000);
  assert.equal(probe.results[1].skipReason, 'timeout');
  assert.equal(probe.results[2].status, 429);
  assert.equal(
    probe.results[2].skipReason,
    'http-status-429'
  );
  assert.equal('retryAfterMs' in probe.results[2], false);

  const rangeComparisonSummary =
    payload.media
      .originalRangeDimensionComparisons
      .summary;

  assert.equal(
    'interpretationApplied'
      in rangeComparisonSummary,
    false
  );
  assert.equal(
    'automaticInclusionDecisionApplied'
      in rangeComparisonSummary,
    false
  );

  const gifFetch =
    payload.media.originalGifFetch;

  assert.equal('maxRequestTimeoutMs' in gifFetch, false);
  assert.equal('retryEnabled' in gifFetch, false);
  assert.equal('cacheMode' in gifFetch, false);
  assert.equal('concurrency' in gifFetch, false);
  assert.equal(
    gifFetch.maxBytesPerResource,
    16 * 1024 * 1024
  );
  assert.equal(
    gifFetch.maxTotalBytes,
    32 * 1024 * 1024
  );
  assert.equal(gifFetch.timeBudgetMs, 15000);
  assert.equal(
    gifFetch.skipped[0].reason,
    'original-gif-over-resource-byte-limit'
  );

  const conditionalFetch =
    payload.media.conditionalOriginalFetch;

  assert.equal('cacheMode' in conditionalFetch, false);
  assert.equal('retryEnabled' in conditionalFetch, false);
  assert.equal(
    'retryRecoveredCount' in conditionalFetch,
    false
  );
  assert.equal(
    'maxRequestTimeoutMs' in conditionalFetch,
    false
  );
  assert.equal(conditionalFetch.selectedCount, 1);
  assert.equal(conditionalFetch.failureCount, 1);
  assert.equal(conditionalFetch.timeBudgetExceeded, true);
  assert.equal(
    conditionalFetch.results[0].skipReason,
    'skipped-technical-time-budget'
  );

  const selection =
    payload.media.originalPolicySelection;

  assert.equal('policyVersion' in selection.summary, false);
  assert.equal('ranking' in selection.summary, false);
  assert.equal(
    'automaticInclusionDecisionApplied'
      in selection.summary,
    false
  );
  assert.equal(
    'semanticInterpretationApplied'
      in selection.summary,
    false
  );
  assert.equal(selection.summary.baseMediaBytes, 321);
  assert.equal(
    selection.summary.hardMediaBytes,
    128 * 1024 * 1024
  );
  assert.equal(
    selection.skipped[0].reason,
    'pixel-ratio-below-1.25'
  );
  assert.equal(selection.skipped[0].pixelRatio, 1.1);
  assert.equal(selection.skipped[0].originalBytes, 900);

  const packageTest = payload.media.packageTest;

  for (
    const key of [
      'zipCompression',
      'selectionMode',
      'packageRefetchCount',
      'packageUsesBodyTransferMapOnly',
      'bodyTransferAvailableCount',
      'bodyTransferBytes'
    ]
  ) {
    assert.equal(key in packageTest, false, key);
  }

  assert.equal(packageTest.status, 'ready');
  assert.equal(packageTest.fileName, 'fixture.zip');
  assert.equal(packageTest.resourceCount, 1);
  assert.equal(packageTest.totalMediaBytes, 321);
  assert.equal(packageTest.linkedOccurrenceCount, 1);
  assert.equal(packageTest.skippedResourceCount, 1);
  assert.equal(packageTest.allSelectedCandidatesPackaged, true);
  assert.equal(packageTest.allEligibleBodyResourcesSelected, true);
  assert.equal(packageTest.hardLimitSatisfied, true);
  assert.equal(packageTest.resources[0].mimeType, 'image/webp');
  assert.equal(packageTest.resources[0].bytes, 321);
  assert.equal(
    packageTest.occurrenceLinks[0].fileName,
    packageTest.resources[0].fileName
  );
  assert.equal(
    packageTest.skippedResources[0]
      .transferSkipReason,
    'content-length-exceeds-limit'
  );

  const comparison =
    payload.media
      .displayOriginalTechnicalComparisons
      .items[0];

  assert.equal(
    'interpretationApplied'
      in payload.media
        .displayOriginalTechnicalComparisons
        .summary,
    false
  );

  assert.equal(
    'fetchDurationMs' in comparison.display,
    false
  );
  assert.equal(
    'fetchDurationMs' in comparison.original,
    false
  );
  assert.equal(comparison.display.bytes, 321);
  assert.equal(comparison.display.mimeType, 'image/webp');
  assert.equal(comparison.original.bytes, 900);
  assert.equal(comparison.original.mimeType, 'image/png');
  assert.equal(comparison.original.skipReason, 'timeout');
  assert.equal(
    comparison.original.error,
    'request timed out'
  );
});

function originalGifResource(index, url) {
  return {
    resourceIndex: index,
    resourceKey: `original-gif-${index}`,
    representativeUrl: url,
    roles: [
      'original-gif'
    ],
    fetchEligible: true,
    occurrences: [
      {
        occurrenceIndex: index,
        source: `body.sequence[${index}]`,
        role: 'original-gif'
      }
    ]
  };
}

function originalGifMetadata(index, url, expectedBytes) {
  return {
    resourceIndex: index,
    resourceKey: `original-gif-${index}`,
    requestedUrl: url,
    fetchMode: 'metadata',
    ok: true,
    status: 200,
    responseContentType: 'image/gif',
    responseContentLength: expectedBytes,
    bodyFetched: false
  };
}

function originalGifDiscovery(resources) {
  return {
    resources,
    occurrences:
      resources.flatMap(
        resource =>
          resource.occurrences.map(
            occurrence => ({
              ...occurrence,
              url:
                resource.representativeUrl
            })
          )
      )
  };
}

async function runOriginalGifFetch(
  context,
  resources,
  expectedBytes
) {
  context.mediaDiscovery =
    originalGifDiscovery(resources);

  context.mediaFetch = {
    results:
      resources.map(
        (resource, index) =>
          originalGifMetadata(
            resource.resourceIndex,
            resource.representativeUrl,
            expectedBytes[index]
          )
      )
  };

  context.warnings = [];

  return vm.runInContext(
    `fetchOriginalGifBodiesForPackage({
      mediaDiscovery,
      mediaFetch,
      warnings
    })`,
    context
  );
}

async function packageOriginalGifFetch(
  context,
  originalGifFetch
) {
  context.originalGifFetch =
    originalGifFetch;

  context.effectiveMediaFetch = vm.runInContext(
    `buildEffectiveMediaFetchForPackage(
      mediaFetch,
      originalGifFetch
    )`,
    context
  );

  context.post = {
    channel: 'test',
    postNumber: '1'
  };

  const packagePayload =
    await vm.runInContext(
      `prepareMediaPackageZipTest({
        post,
        mediaDiscovery,
        mediaFetch: effectiveMediaFetch,
        warnings
      })`,
      context
    );

  context.packagePayload =
    packagePayload;

  vm.runInContext(
    `attachPackageResourceReferences(
      mediaDiscovery,
      packagePayload.summary.resources
    )`,
    context
  );

  return packagePayload;
}

test('extractBody preserves an HR at its sequence position', () => {
  const root = elementNode('DIV', [
    textNode('before'),
    elementNode('HR'),
    textNode('after')
  ]);

  const context = loadContentScript({
    document: {
      querySelector: selector =>
        selector === '.article-content'
          ? root
          : null
    }
  });

  context.warnings = [];

  const body = vm.runInContext(
    'extractBody(warnings)',
    context
  );

  assert.deepEqual(
    plain(body.sequence),
    [
      {
        type: 'text',
        text: 'before'
      },
      {
        type: 'horizontalRule'
      },
      {
        type: 'text',
        text: 'after'
      }
    ]
  );
  assert.equal(body.summary.horizontalRules, 1);
  assert.equal(body.unknownElements.length, 0);
});

test('extractPostInfo preserves breaking route and self-link observation', () => {
  const selfLinkUrl =
    'https://arca.live/b/trickcal/180693800';

  const selfLink = {
    textContent: selfLinkUrl,
    href: selfLinkUrl,
    getAttribute: name =>
      name === 'href'
        ? selfLinkUrl
        : null
  };

  const context = loadContentScript({
    location: {
      origin: 'https://arca.live',
      href:
        'https://arca.live/b/breaking/180693800',
      pathname: '/b/breaking/180693800'
    },
    document: {
      querySelector: () => null,
      querySelectorAll: selector =>
        selector
        === '.article-view .article-link a[href]'
          ? [selfLink]
          : []
    }
  });

  context.warnings = [];

  const post = vm.runInContext(
    'extractPostInfo(warnings)',
    context
  );

  assert.equal(post.channel, 'breaking');
  assert.equal(post.postNumber, '180693800');
  assert.equal(
    post.url,
    'https://arca.live/b/breaking/180693800'
  );
  assert.equal(post.selfLinkCandidates.length, 1);
  assert.deepEqual(
    plain(post.selfLinkCandidates[0]),
    {
      text: selfLinkUrl,
      rawHref: selfLinkUrl,
      resolvedHref: selfLinkUrl
    }
  );
});

test('comment count mismatch preserves displayed and extracted observations', () => {
  const allComments =
    Array.from(
      { length: 121 },
      (_, index) => ({
        commentId: `comment-${index + 1}`,
        replyDepth: 0,
        text: `comment ${index + 1}`,
        emoticons: [],
        audios: [],
        linkCard: null,
        contentParts: [],
        author: `author-${index + 1}`,
        createdAt: '2026-08-22T00:00:00Z',
        type: 'root',
        modified: false,
        deleted: false,
        links: [],
        textSource: 'direct',
        displayState: null
      })
    );

  const context = loadContentScript();

  context.allComments = allComments;
  context.pageResults = [
    {
      page: 1,
      ok: true,
      status: 200,
      durationMs: 0
    },
    {
      page: 2,
      ok: true,
      status: 200,
      durationMs: 0
    }
  ];
  context.relationAudit = [];

  context.summary = vm.runInContext(
    `buildCommentSummary({
      detectedLastPage: 2,
      displayedCommentCount: 120,
      allComments,
      pageResults,
      relationAudit,
      commentCollectionDurationMs: 0
    })`,
    context
  );

  assert.equal(context.summary.status, 'completed');
  assert.equal(context.summary.displayedCommentCount, 120);
  assert.equal(context.summary.extractedCommentCount, 121);
  assert.equal(context.summary.uniqueCommentIds, 121);
  assert.equal(context.summary.commentCountMatches, false);
  assert.equal(context.summary.duplicateCommentIds.length, 0);
  assert.equal(allComments.length, 121);

  context.comments = {
    summary: context.summary
  };
  context.warnings = [];

  vm.runInContext(
    'appendCommentDiagnostics(comments, warnings)',
    context
  );

  const mismatchWarning =
    context.warnings.find(
      warning =>
        warning.code === 'COMMENT_COUNT_MISMATCH'
    );

  assert.deepEqual(
    plain(mismatchWarning),
    {
      stage: 'comments',
      code: 'COMMENT_COUNT_MISMATCH',
      displayedCommentCount: 120,
      extractedCommentCount: 121,
      uniqueCommentIds: 121
    }
  );
});

test('unknown BUTTON text is observed without entering body sequence', () => {
  function buttonNode(text, className) {
    const button = elementNode('BUTTON', [
      textNode(text)
    ]);

    button.className = className;
    button.outerHTML =
      `<button class="${className}">${text}</button>`;

    return button;
  }

  const video = elementNode('VIDEO');
  video.src = 'https://example.com/post-video.mp4';
  video.currentSrc = video.src;
  video.controls = true;

  const root = elementNode('DIV', [
    textNode('actual author text'),
    buttonNode('>>', 'control-right'),
    buttonNode('1.00', 'control-rate'),
    buttonNode('<<', 'control-left'),
    video
  ]);

  const context = loadContentScript({
    document: {
      querySelector: selector =>
        selector === '.article-content'
          ? root
          : null
    }
  });

  context.warnings = [];

  const body = vm.runInContext(
    'extractBody(warnings)',
    context
  );

  assert.deepEqual(
    plain(
      body.unknownElements.map(element => ({
        tagName: element.tagName,
        className: element.className,
        text: element.text,
        htmlSnippet: element.htmlSnippet
      }))
    ),
    [
      {
        tagName: 'BUTTON',
        className: 'control-right',
        text: '>>',
        htmlSnippet:
          '<button class="control-right">>></button>'
      },
      {
        tagName: 'BUTTON',
        className: 'control-rate',
        text: '1.00',
        htmlSnippet:
          '<button class="control-rate">1.00</button>'
      },
      {
        tagName: 'BUTTON',
        className: 'control-left',
        text: '<<',
        htmlSnippet:
          '<button class="control-left"><<</button>'
      }
    ]
  );

  assert.deepEqual(
    plain(
      body.sequence
        .filter(item => item.type === 'text')
        .map(item => item.text)
    ),
    ['actual author text']
  );
  assert.equal(
    body.sequence.some(
      item =>
        item.type === 'text'
        && ['>>', '1.00', '<<'].includes(item.text)
    ),
    false
  );
  assert.equal(body.summary.unknownElements, 3);
  assert.equal(body.summary.videos, 1);
  assert.equal(
    body.sequence.some(
      item =>
        item.type === 'video'
        && item.src === video.src
    ),
    true
  );
});

test('conditional originals refresh final package image dimension counters', async () => {
  const context = loadContentScript();

  const png = Buffer.alloc(24);
  Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a
  ]).copy(png, 0);
  png.writeUInt32BE(2, 16);
  png.writeUInt32BE(3, 20);

  context.packagePayload = {
    summary: {
      resources: [
        {
          resourceId: 'media-0000',
          sourceResourceIndex: 0,
          bytes: 10,
          imageDimensions: {
            status: 'success'
          },
          occurrences: []
        }
      ],
      occurrenceLinks: [],
      skippedResources: [
        {
          resourceIndex: 1
        }
      ],
      resourceCount: 1,
      totalMediaBytes: 10,
      linkedOccurrenceCount: 0,
      skippedResourceCount: 1,
      imageDimensionAttemptedCount: 1,
      imageDimensionSuccessCount: 1,
      imageDimensionFailureCount: 0,
      maxTotalBytes: 1024
    },
    files: []
  };

  context.conditionalOriginalFetch = {
    transferMap: new Map([
      [
        1,
        {
          base64: png.toString('base64'),
          mimeType: 'image/png',
          byteLength: png.byteLength
        }
      ]
    ]),
    summary: {
      results: [
        {
          accepted: true,
          originalResourceIndex: 1
        }
      ]
    }
  };

  context.mediaDiscovery = {
    resources: [
      {
        resourceIndex: 1,
        resourceKey: 'original-resource',
        representativeUrl:
          'https://ac-o.arca.live/original.png',
        roles: [
          'original-image'
        ],
        occurrences: []
      }
    ]
  };

  context.rangeComparisons = {
    items: [
      {
        originalResourceIndex: 1,
        original: {
          width: 2,
          height: 3,
          contentType: 'image/png'
        }
      }
    ]
  };

  context.warnings = [];

  await vm.runInContext(
    `appendConditionalOriginalsToPackage({
      packagePayload,
      conditionalOriginalFetch,
      mediaDiscovery,
      rangeComparisons,
      warnings
    })`,
    context
  );

  assert.equal(
    context.packagePayload.summary.resourceCount,
    2
  );
  assert.equal(
    context.packagePayload.summary.imageDimensionAttemptedCount,
    2
  );
  assert.equal(
    context.packagePayload.summary.imageDimensionSuccessCount,
    2
  );
  assert.equal(
    context.packagePayload.summary.imageDimensionFailureCount,
    0
  );
});

test('source-less zero-size IMG stays in sequence as unaddressable', () => {
  const root = elementNode('DIV', [
    textNode('before'),
    imageNode(),
    textNode('after')
  ]);

  const context = loadContentScript({
    document: {
      querySelector: selector =>
        selector === '.article-content'
          ? root
          : null
    }
  });

  context.warnings = [];

  const body = vm.runInContext(
    'extractBody(warnings)',
    context
  );

  assert.deepEqual(
    plain(body.sequence).map(item => item.type),
    [
      'text',
      'unaddressableImage',
      'text'
    ]
  );
  assert.deepEqual(
    plain(body.sequence[1].addressability),
    {
      status: 'unaddressable',
      reason:
        'no-url-evidence-and-zero-rendered-size'
    }
  );
  assert.equal(body.sequence[1].srcRaw, null);
  assert.equal(body.sequence[1].src, null);
  assert.equal(body.sequence[1].currentSrc, null);
  assert.equal(body.sequence[1].renderedWidth, 0);
  assert.equal(body.sequence[1].renderedHeight, 0);
  assert.equal(body.summary.images, 0);
  assert.equal(body.summary.unaddressableImages, 1);

  context.body = body;
  context.preview = {};
  context.comments = {
    items: []
  };

  const discovery = vm.runInContext(
    `discoverMediaResources({
      preview,
      body,
      comments
    })`,
    context
  );

  assert.equal(discovery.occurrenceCount, 0);
  assert.equal(discovery.uniqueResourceCount, 0);
});

test('URL-backed IMG keeps existing image discovery behavior', () => {
  const url =
    'https://ac.arca.live/example/image.png';

  const root = elementNode('DIV', [
    imageNode({
      srcRaw: url,
      src: url,
      currentSrc: url,
      naturalWidth: 640,
      naturalHeight: 480,
      renderedWidth: 0,
      renderedHeight: 0
    })
  ]);

  const context = loadContentScript({
    document: {
      querySelector: selector =>
        selector === '.article-content'
          ? root
          : null
    }
  });

  context.warnings = [];

  const body = vm.runInContext(
    'extractBody(warnings)',
    context
  );

  assert.equal(body.sequence[0].type, 'image');
  assert.equal(body.sequence[0].currentSrc, url);
  assert.equal(body.sequence[0].naturalWidth, 640);
  assert.equal(body.sequence[0].naturalHeight, 480);
  assert.equal(body.sequence[0].renderedWidth, 0);
  assert.equal(body.sequence[0].renderedHeight, 0);
  assert.equal(
    Object.hasOwn(body.sequence[0], 'addressability'),
    false
  );
  assert.equal(body.summary.images, 1);
  assert.equal(body.summary.unaddressableImages, 0);

  context.body = body;
  context.preview = {};
  context.comments = {
    items: []
  };

  const discovery = vm.runInContext(
    `discoverMediaResources({
      preview,
      body,
      comments
    })`,
    context
  );

  assert.equal(discovery.occurrenceCount, 1);
  assert.equal(discovery.uniqueResourceCount, 1);
  assert.equal(
    discovery.occurrences[0].role,
    'display-image'
  );
  assert.equal(discovery.occurrences[0].url, url);
  assert.equal(discovery.resources[0].fetchEligible, true);
});

test('original GIF bytes follow the existing resource and package links', async () => {
  const originalGifUrl =
    'https://ac-o.arca.live/example/original.gif';

  const originalVideoUrl =
    'https://ac-o.arca.live/example/original.mp4';

  const gif = Buffer.from([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x02,
    0x00,
    0x03,
    0x00
  ]);

  const requests = [];

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage(request) {
          requests.push(request);

          return {
            success: true,
            results: [
              {
                resourceIndex: 0,
                resourceKey: 'original-gif-resource',
                requestedUrl: originalGifUrl,
                fetchMode: 'body',
                attempts: 1,
                rateLimitEncountered: false,
                ok: true,
                metadataFetched: true,
                bodyFetched: true,
                status: 200,
                finalUrl: originalGifUrl,
                responseContentType:
                  'application/octet-stream',
                responseContentLength: gif.byteLength,
                blobType: 'application/octet-stream',
                blobSize: gif.byteLength,
                contentLengthMatchesBlobSize: true,
                bodyTransferAvailable: true,
                bodyTransferByteLength: gif.byteLength,
                bodyBase64: gif.toString('base64')
              }
            ]
          };
        }
      }
    },
    setTimeout(callback) {
      callback();
      return 0;
    },
    clearTimeout() {}
  });

  context.mediaDiscovery = {
    occurrences: [
      {
        occurrenceIndex: 0,
        source: 'body.sequence[0]',
        role: 'original-gif',
        url: originalGifUrl
      },
      {
        occurrenceIndex: 1,
        source: 'body.sequence[0]',
        role: 'original-video',
        url: originalVideoUrl
      }
    ],
    resources: [
      {
        resourceIndex: 0,
        resourceKey: 'original-gif-resource',
        representativeUrl: originalGifUrl,
        roles: [
          'original-gif'
        ],
        fetchEligible: true,
        occurrences: [
          {
            occurrenceIndex: 0,
            source: 'body.sequence[0]',
            role: 'original-gif'
          }
        ]
      },
      {
        resourceIndex: 1,
        resourceKey: 'original-video-resource',
        representativeUrl: originalVideoUrl,
        roles: [
          'original-video'
        ],
        fetchEligible: true,
        occurrences: [
          {
            occurrenceIndex: 1,
            source: 'body.sequence[0]',
            role: 'original-video'
          }
        ]
      }
    ]
  };

  context.mediaFetch = {
    results: [
      {
        resourceIndex: 0,
        resourceKey: 'original-gif-resource',
        requestedUrl: originalGifUrl,
        fetchMode: 'metadata',
        ok: true,
        status: 200,
        responseContentType:
          'application/octet-stream',
        responseContentLength: gif.byteLength,
        bodyFetched: false
      },
      {
        resourceIndex: 1,
        resourceKey: 'original-video-resource',
        requestedUrl: originalVideoUrl,
        fetchMode: 'metadata',
        ok: true,
        status: 200,
        responseContentType: 'video/mp4',
        responseContentLength: 1024,
        bodyFetched: false
      }
    ]
  };

  context.warnings = [];

  context.originalGifFetch =
    await vm.runInContext(
      `fetchOriginalGifBodiesForPackage({
        mediaDiscovery,
        mediaFetch,
        warnings
      })`,
      context
    );

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].type,
    'AI_AI_FETCH_MEDIA_BATCH'
  );
  assert.equal(requests[0].bodyConcurrency, 1);
  assert.equal(requests[0].bodyTimeoutMs, 10000);
  assert.equal(requests[0].retry429Count, 0);
  assert.equal(
    requests[0].maxBytesPerResource,
    16 * 1024 * 1024
  );
  assert.equal(
    requests[0].returnBodyBase64MaxBytes,
    16 * 1024 * 1024
  );
  assert.equal(requests[0].resources.length, 1);
  assert.equal(
    requests[0].resources[0].url,
    originalGifUrl
  );
  assert.equal(
    requests[0].resources[0].fetchMode,
    'body'
  );

  assert.equal(
    context.originalGifFetch.summary.status,
    'completed'
  );
  assert.equal(
    context.originalGifFetch.summary.successCount,
    1
  );
  assert.equal(
    context.originalGifFetch.summary.transferredBytes,
    gif.byteLength
  );
  assert.equal(
    context.originalGifFetch.summary.results[0]
      .validatedMimeType,
    'image/gif'
  );
  assert.equal(
    context.originalGifFetch.summary.results[0]
      .responseContentType,
    'application/octet-stream'
  );
  assert.equal(
    context.originalGifFetch.summary.maxTotalBytes,
    32 * 1024 * 1024
  );
  assert.equal(
    context.originalGifFetch.summary.timeBudgetMs,
    15000
  );
  assert.equal(
    context.originalGifFetch.summary.concurrency,
    1
  );
  assert.equal(
    context.originalGifFetch.summary.retryEnabled,
    false
  );
  assert.equal(context.originalGifFetch.transferMap.size, 1);

  context.effectiveMediaFetch = vm.runInContext(
    `buildEffectiveMediaFetchForPackage(
      mediaFetch,
      originalGifFetch
    )`,
    context
  );

  context.post = {
    channel: 'test',
    postNumber: '1'
  };

  context.packagePayload =
    await vm.runInContext(
      `prepareMediaPackageZipTest({
        post,
        mediaDiscovery,
        mediaFetch: effectiveMediaFetch,
        warnings
      })`,
      context
    );

  const packageSummary =
    context.packagePayload.summary;

  assert.equal(packageSummary.status, 'ready');
  assert.equal(packageSummary.resourceCount, 1);
  assert.equal(packageSummary.originalGifPackagedCount, 1);
  assert.equal(
    packageSummary.originalGifPackagedBytes,
    gif.byteLength
  );
  assert.equal(packageSummary.resources[0].mimeType, 'image/gif');
  assert.equal(
    packageSummary.resources[0].validatedMimeType,
    'image/gif'
  );
  assert.equal(
    packageSummary.resources[0]
      .validatedGifSignature,
    'GIF89a'
  );
  assert.equal(
    packageSummary.resources[0]
      .serverObservedResponseContentType,
    'application/octet-stream'
  );
  assert.equal(
    packageSummary.resources[0]
      .serverObservedBlobType,
    'application/octet-stream'
  );
  assert.equal(
    packageSummary.resources[0].fileName,
    'media/media-0000.gif'
  );
  assert.deepEqual(
    plain(packageSummary.resources[0].imageDimensions),
    {
      status: 'success',
      width: 2,
      height: 3,
      pixelCount: 6,
      mimeType: 'image/gif',
      source: 'packaged-bytes',
      additionalNetworkRequest: false,
      method: 'header-parser',
      parser: 'gif-logical-screen',
      error: null
    }
  );
  assert.deepEqual(
    plain(packageSummary.occurrenceLinks),
    [
      {
        occurrenceIndex: 0,
        source: 'body.sequence[0]',
        role: 'original-gif',
        resourceId: 'media-0000',
        fileName: 'media/media-0000.gif'
      }
    ]
  );
  assert.deepEqual(
    Array.from(context.packagePayload.files[0].data),
    Array.from(gif)
  );
});

test('unknown-size and over-limit original GIFs are not fetched', async () => {
  const originalGifUrl =
    'https://ac-o.arca.live/example/oversize.gif';

  const unknownSizeGifUrl =
    'https://ac-o.arca.live/example/unknown-size.gif';

  let requestCount = 0;

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage() {
          requestCount++;
          throw new Error('unexpected body request');
        }
      }
    }
  });

  context.mediaDiscovery = {
    resources: [
      {
        resourceIndex: 0,
        resourceKey: 'oversize-original-gif',
        representativeUrl: originalGifUrl,
        roles: [
          'original-gif'
        ],
        fetchEligible: true,
        occurrences: []
      },
      {
        resourceIndex: 1,
        resourceKey: 'unknown-size-original-gif',
        representativeUrl: unknownSizeGifUrl,
        roles: [
          'original-gif'
        ],
        fetchEligible: true,
        occurrences: []
      }
    ]
  };

  context.mediaFetch = {
    results: [
      {
        resourceIndex: 0,
        resourceKey: 'oversize-original-gif',
        requestedUrl: originalGifUrl,
        fetchMode: 'metadata',
        ok: true,
        status: 200,
        responseContentType: 'image/gif',
        responseContentLength:
          (16 * 1024 * 1024) + 1,
        bodyFetched: false
      },
      {
        resourceIndex: 1,
        resourceKey: 'unknown-size-original-gif',
        requestedUrl: unknownSizeGifUrl,
        fetchMode: 'metadata',
        ok: true,
        status: 200,
        responseContentType: 'image/gif',
        responseContentLength: null,
        bodyFetched: false
      }
    ]
  };

  context.warnings = [];

  const originalGifFetch =
    await vm.runInContext(
      `fetchOriginalGifBodiesForPackage({
        mediaDiscovery,
        mediaFetch,
        warnings
      })`,
      context
    );

  assert.equal(requestCount, 0);
  assert.equal(originalGifFetch.summary.status, 'skipped');
  assert.equal(originalGifFetch.summary.selectedCount, 0);
  assert.equal(originalGifFetch.summary.successCount, 0);
  assert.equal(
    originalGifFetch.summary.technicalSkippedCount,
    2
  );
  assert.equal(originalGifFetch.transferMap.size, 0);
  assert.deepEqual(
    plain(
      originalGifFetch.summary.skipped.map(
        item => item.reason
      )
    ),
    [
      'original-gif-over-resource-byte-limit',
      'original-gif-size-unavailable'
    ]
  );
});

test('non-GIF metadata MIME skips original GIF body fetch', async () => {
  const originalUrl =
    'https://ac-o.arca.live/example/original.mp4?type=orig';

  let requestCount = 0;

  const occurrence = {
    occurrenceIndex: 0,
    source: 'body.sequence[0]',
    role: 'original-gif',
    url: originalUrl
  };

  const resource = {
    resourceIndex: 0,
    resourceKey: 'data-orig-gif-resource',
    representativeUrl: originalUrl,
    roles: [
      'original-gif'
    ],
    fetchEligible: true,
    occurrences: [
      occurrence
    ]
  };

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage() {
          requestCount++;
          throw new Error('unexpected body request');
        }
      }
    }
  });

  context.mediaDiscovery = {
    resources: [resource],
    occurrences: [occurrence]
  };

  context.mediaFetch = {
    results: [
      {
        resourceIndex: 0,
        resourceKey: resource.resourceKey,
        requestedUrl: originalUrl,
        fetchMode: 'metadata',
        ok: true,
        status: 200,
        responseContentType:
          'Video/MP4; charset=binary',
        responseContentLength: 50983,
        bodyFetched: false
      }
    ]
  };

  context.warnings = [];

  const originalGifFetch =
    await vm.runInContext(
      `fetchOriginalGifBodiesForPackage({
        mediaDiscovery,
        mediaFetch,
        warnings
      })`,
      context
    );

  assert.equal(requestCount, 0);
  assert.equal(originalGifFetch.summary.status, 'skipped');
  assert.equal(originalGifFetch.summary.attemptedCount, 0);
  assert.equal(originalGifFetch.summary.signatureMismatchCount, 0);
  assert.equal(originalGifFetch.summary.skipped.length, 1);
  assert.equal(
    originalGifFetch.summary.skipped[0].reason,
    'original-gif-metadata-mime-not-gif'
  );
  assert.equal(
    originalGifFetch.summary.skipped[0].metadataContentType,
    'Video/MP4; charset=binary'
  );
  assert.equal(
    originalGifFetch.summary.skipped[0]
      .normalizedMetadataContentType,
    'video/mp4'
  );
  assert.equal(
    context.warnings.some(
      warning =>
        warning.code
        === 'ORIGINAL_GIF_SIGNATURE_MISMATCH'
    ),
    false
  );
  assert.equal(context.mediaDiscovery.resources[0], resource);
  assert.equal(context.mediaDiscovery.occurrences[0], occurrence);
  assert.equal(resource.representativeUrl, originalUrl);
  assert.equal(occurrence.url, originalUrl);
});

test('ambiguous binary MIME still reaches GIF byte validation', async () => {
  const originalGifUrl =
    'https://ac-o.arca.live/example/ambiguous-binary';

  const metadataContentType =
    'Application/X-Binary; charset=binary';

  const gif = Buffer.from([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x02,
    0x00,
    0x03,
    0x00
  ]);

  let requestCount = 0;

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage() {
          requestCount++;

          return {
            success: true,
            results: [
              {
                resourceIndex: 0,
                resourceKey: 'ambiguous-binary-gif',
                requestedUrl: originalGifUrl,
                fetchMode: 'body',
                attempts: 1,
                ok: true,
                bodyFetched: true,
                status: 200,
                finalUrl: originalGifUrl,
                responseContentType:
                  'application/x-binary',
                responseContentLength: gif.byteLength,
                blobType: 'application/x-binary',
                blobSize: gif.byteLength,
                bodyTransferAvailable: true,
                bodyTransferByteLength: gif.byteLength,
                bodyBase64: gif.toString('base64')
              }
            ]
          };
        }
      }
    }
  });

  context.mediaDiscovery = {
    resources: [
      {
        resourceIndex: 0,
        resourceKey: 'ambiguous-binary-gif',
        representativeUrl: originalGifUrl,
        roles: [
          'original-gif'
        ],
        fetchEligible: true,
        occurrences: []
      }
    ]
  };

  context.mediaFetch = {
    results: [
      {
        resourceIndex: 0,
        resourceKey: 'ambiguous-binary-gif',
        requestedUrl: originalGifUrl,
        fetchMode: 'metadata',
        ok: true,
        status: 200,
        responseContentType:
          metadataContentType,
        responseContentLength: gif.byteLength,
        bodyFetched: false
      }
    ]
  };

  context.warnings = [];

  const originalGifFetch =
    await vm.runInContext(
      `fetchOriginalGifBodiesForPackage({
        mediaDiscovery,
        mediaFetch,
        warnings
      })`,
      context
    );

  assert.equal(requestCount, 1);
  assert.equal(originalGifFetch.summary.successCount, 1);
  assert.equal(originalGifFetch.summary.signatureMismatchCount, 0);
  assert.equal(originalGifFetch.transferMap.size, 1);
  assert.equal(originalGifFetch.summary.results[0].accepted, true);
  assert.equal(
    originalGifFetch.summary.results[0].validatedMimeType,
    'image/gif'
  );
  assert.equal(
    originalGifFetch.summary.results[0].metadataContentType,
    metadataContentType
  );
  assert.equal(
    originalGifFetch.summary.results[0].decodedSignature,
    'GIF89a'
  );
  assert.equal(
    originalGifFetch.summary.results[0].decodedByteLength,
    gif.byteLength
  );
});

test('original GIF size mismatch is rejected before packaging', async () => {
  const originalGifUrl =
    'https://ac-o.arca.live/example/mismatch.gif';

  const truncatedGif = Buffer.from([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x02,
    0x00,
    0x03
  ]);

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage() {
          return {
            success: true,
            results: [
              {
                resourceIndex: 0,
                resourceKey: 'mismatch-original-gif',
                requestedUrl: originalGifUrl,
                fetchMode: 'body',
                attempts: 1,
                ok: true,
                bodyFetched: true,
                status: 200,
                finalUrl: originalGifUrl,
                responseContentType: 'image/gif',
                responseContentLength: 10,
                blobType: 'image/gif',
                blobSize: 10,
                contentLengthMatchesBlobSize: true,
                bodyTransferAvailable: true,
                bodyTransferByteLength: 10,
                bodyBase64:
                  truncatedGif.toString('base64')
              }
            ]
          };
        }
      }
    }
  });

  context.mediaDiscovery = {
    resources: [
      {
        resourceIndex: 0,
        resourceKey: 'mismatch-original-gif',
        representativeUrl: originalGifUrl,
        roles: [
          'original-gif'
        ],
        fetchEligible: true,
        occurrences: []
      }
    ]
  };

  context.mediaFetch = {
    results: [
      {
        resourceIndex: 0,
        resourceKey: 'mismatch-original-gif',
        requestedUrl: originalGifUrl,
        fetchMode: 'metadata',
        ok: true,
        status: 200,
        responseContentType: 'image/gif',
        responseContentLength: 10,
        bodyFetched: false
      }
    ]
  };

  context.warnings = [];

  const originalGifFetch =
    await vm.runInContext(
      `fetchOriginalGifBodiesForPackage({
        mediaDiscovery,
        mediaFetch,
        warnings
      })`,
      context
    );

  assert.equal(originalGifFetch.summary.status, 'partial');
  assert.equal(originalGifFetch.summary.successCount, 0);
  assert.equal(originalGifFetch.summary.failureCount, 1);
  assert.equal(originalGifFetch.summary.sizeMismatchCount, 1);
  assert.equal(
    originalGifFetch.summary.decodedSizeMismatchCount,
    1
  );
  assert.equal(
    originalGifFetch.summary.results[0].skipReason,
    'original-gif-decoded-size-mismatch'
  );
  assert.equal(
    originalGifFetch.summary.results[0]
      .reportedBodyTransferByteLength,
    10
  );
  assert.equal(
    originalGifFetch.summary.results[0]
      .decodedByteLength,
    truncatedGif.byteLength
  );
  assert.equal(
    originalGifFetch.summary.results[0]
      .reportedBlobSize,
    10
  );
  assert.equal(originalGifFetch.transferMap.size, 0);
  assert.equal(originalGifFetch.results.length, 0);
  assert.equal(
    context.warnings.some(
      warning =>
        warning.code
        === 'ORIGINAL_GIF_DECODED_SIZE_MISMATCH'
    ),
    true
  );
});

test('HTML and undecodable base64 are rejected before GIF packaging', async () => {
  const html = Buffer.from('<html></h>');

  assert.equal(html.byteLength, 10);

  const urls = [
    'https://ac-o.arca.live/example/html.gif',
    'https://ac-o.arca.live/example/invalid-base64.gif'
  ];

  const requests = [];

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage(request) {
          requests.push(request);

          const resource =
            request.resources[0];

          const isHtml =
            resource.resourceIndex === 0;

          return {
            success: true,
            results: [
              {
                resourceIndex:
                  resource.resourceIndex,
                resourceKey:
                  resource.resourceKey,
                requestedUrl: resource.url,
                fetchMode: 'body',
                attempts: 1,
                ok: true,
                bodyFetched: true,
                status: 200,
                finalUrl: resource.url,
                responseContentType:
                  isHtml
                    ? 'text/html'
                    : 'application/json',
                responseContentLength: 10,
                blobType:
                  isHtml
                    ? 'text/html'
                    : 'application/json',
                blobSize: 10,
                bodyTransferAvailable: true,
                bodyTransferByteLength: 10,
                bodyBase64:
                  isHtml
                    ? html.toString('base64')
                    : '%%%invalid-base64%%%'
              }
            ]
          };
        }
      }
    },
    atob(value) {
      if (value === '%%%invalid-base64%%%') {
        throw new Error('InvalidCharacterError');
      }

      return Buffer.from(
        value,
        'base64'
      ).toString('binary');
    },
    setTimeout(callback) {
      callback();
      return 0;
    },
    clearTimeout() {}
  });

  const resources =
    urls.map(
      (url, index) =>
        originalGifResource(index, url)
    );

  const originalGifFetch =
    await runOriginalGifFetch(
      context,
      resources,
      [
        10,
        10
      ]
    );

  assert.equal(requests.length, 2);
  assert.equal(originalGifFetch.summary.successCount, 0);
  assert.equal(originalGifFetch.summary.failureCount, 2);
  assert.equal(
    originalGifFetch.summary.signatureMismatchCount,
    1
  );
  assert.equal(
    originalGifFetch.summary.base64DecodeFailureCount,
    1
  );
  assert.deepEqual(
    plain(
      originalGifFetch.summary.results.map(
        result => result.skipReason
      )
    ),
    [
      'original-gif-signature-mismatch',
      'original-gif-base64-decode-failed'
    ]
  );
  assert.equal(
    originalGifFetch.summary.results[0]
      .decodedSignature,
    '<html>'
  );
  assert.equal(
    originalGifFetch.summary.results[0]
      .responseContentType,
    'text/html'
  );
  assert.equal(
    originalGifFetch.summary.results[1]
      .base64DecodeError,
    'Error: InvalidCharacterError'
  );
  assert.equal(originalGifFetch.transferMap.size, 0);
  assert.equal(originalGifFetch.results.length, 0);
  assert.equal(
    context.warnings.some(
      warning =>
        warning.code
        === 'ORIGINAL_GIF_SIGNATURE_MISMATCH'
    ),
    true
  );
  assert.equal(
    context.warnings.some(
      warning =>
        warning.code
        === 'ORIGINAL_GIF_BASE64_DECODE_FAILED'
    ),
    true
  );

  const packagePayload =
    await packageOriginalGifFetch(
      context,
      originalGifFetch
    );

  assert.equal(packagePayload.summary.resourceCount, 0);
  assert.equal(packagePayload.summary.occurrenceLinks.length, 0);
  assert.equal(
    context.mediaDiscovery.resources.every(
      resource =>
        resource.packageResourceId === null
        && resource.packageFileName === null
    ),
    true
  );
  assert.equal(
    context.mediaDiscovery.occurrences.every(
      occurrence =>
        occurrence.packageResourceId === null
        && occurrence.packageFileName === null
    ),
    true
  );
});

test('32 MiB original GIF budget excludes later candidates before request', async () => {
  const urls = [
    'https://ac-o.arca.live/example/budget-0.gif',
    'https://ac-o.arca.live/example/budget-1.gif',
    'https://ac-o.arca.live/example/budget-2.gif'
  ];

  const requestedIndexes = [];

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage(request) {
          const resource =
            request.resources[0];

          requestedIndexes.push(
            resource.resourceIndex
          );

          return {
            success: true,
            results: [
              {
                resourceIndex:
                  resource.resourceIndex,
                resourceKey:
                  resource.resourceKey,
                requestedUrl: resource.url,
                fetchMode: 'body',
                attempts: 1,
                ok: false,
                bodyFetched: false,
                bodyTransferAvailable: false,
                status: 503,
                skipReason: 'test-request-failure'
              }
            ]
          };
        }
      }
    },
    setTimeout(callback) {
      callback();
      return 0;
    },
    clearTimeout() {}
  });

  const resources =
    urls.map(
      (url, index) =>
        originalGifResource(index, url)
    );

  const originalGifFetch =
    await runOriginalGifFetch(
      context,
      resources,
      [
        16 * 1024 * 1024,
        16 * 1024 * 1024,
        1
      ]
    );

  assert.deepEqual(
    requestedIndexes,
    [
      0,
      1
    ]
  );
  assert.equal(originalGifFetch.summary.selectedCount, 2);
  assert.equal(
    originalGifFetch.summary.selectedExpectedBytes,
    32 * 1024 * 1024
  );
  assert.equal(
    originalGifFetch.summary.technicalSkippedCount,
    1
  );
  assert.equal(
    originalGifFetch.summary.skipped[0].resourceIndex,
    2
  );
  assert.equal(
    originalGifFetch.summary.skipped[0].reason,
    'original-gif-total-byte-budget'
  );
});

test('15 second original GIF budget explicitly skips remaining candidates', async () => {
  const gif = Buffer.from([
    0x47,
    0x49,
    0x46,
    0x38,
    0x37,
    0x61,
    0x02,
    0x00,
    0x03,
    0x00
  ]);

  const urls = [
    'https://ac-o.arca.live/example/time-0.gif',
    'https://ac-o.arca.live/example/time-1.gif'
  ];

  const requestedIndexes = [];
  let now = 0;

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage(request) {
          const resource =
            request.resources[0];

          requestedIndexes.push(
            resource.resourceIndex
          );

          now = 15000;

          return {
            success: true,
            results: [
              {
                resourceIndex:
                  resource.resourceIndex,
                resourceKey:
                  resource.resourceKey,
                requestedUrl: resource.url,
                fetchMode: 'body',
                attempts: 1,
                ok: true,
                bodyFetched: true,
                bodyTransferAvailable: true,
                status: 200,
                finalUrl: resource.url,
                responseContentType: 'image/gif',
                responseContentLength: gif.byteLength,
                blobType: 'image/gif',
                blobSize: gif.byteLength,
                bodyTransferByteLength: gif.byteLength,
                bodyBase64: gif.toString('base64')
              }
            ]
          };
        }
      }
    },
    performance: {
      now: () => now
    }
  });

  const resources =
    urls.map(
      (url, index) =>
        originalGifResource(index, url)
    );

  const originalGifFetch =
    await runOriginalGifFetch(
      context,
      resources,
      [
        gif.byteLength,
        gif.byteLength
      ]
    );

  assert.deepEqual(requestedIndexes, [0]);
  assert.equal(originalGifFetch.summary.successCount, 1);
  assert.equal(originalGifFetch.summary.failureCount, 1);
  assert.equal(
    originalGifFetch.summary.technicalSkippedCount,
    1
  );
  assert.equal(
    originalGifFetch.summary.timeBudgetExceeded,
    true
  );
  assert.equal(
    originalGifFetch.summary.results[1].skipReason,
    'skipped-technical-time-budget'
  );
  assert.equal(
    originalGifFetch.summary.results[1].attempts,
    0
  );
  assert.equal(
    context.warnings.some(
      warning =>
        warning.code
        === 'ORIGINAL_GIF_FETCH_TIME_BUDGET_EXCEEDED'
    ),
    true
  );
});

test('timeout, HTTP 429, and request errors stay unpackaged failures', async () => {
  const urls = [
    'https://ac-o.arca.live/example/timeout.gif',
    'https://ac-o.arca.live/example/rate-limit.gif',
    'https://ac-o.arca.live/example/request-error.gif'
  ];

  const context = loadContentScript({
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage(request) {
          const resource =
            request.resources[0];

          if (resource.resourceIndex === 2) {
            throw new Error('message transport failed');
          }

          const isTimeout =
            resource.resourceIndex === 0;

          return {
            success: true,
            results: [
              {
                resourceIndex:
                  resource.resourceIndex,
                resourceKey:
                  resource.resourceKey,
                requestedUrl: resource.url,
                fetchMode: 'body',
                attempts: 1,
                ok: false,
                bodyFetched: false,
                bodyTransferAvailable: false,
                status:
                  isTimeout
                    ? null
                    : 429,
                rateLimitEncountered:
                  !isTimeout,
                skipReason:
                  isTimeout
                    ? 'timeout'
                    : 'http-status-429',
                error:
                  isTimeout
                    ? 'request timed out'
                    : 'HTTP 429'
              }
            ]
          };
        }
      }
    },
    setTimeout(callback) {
      callback();
      return 0;
    },
    clearTimeout() {}
  });

  const resources =
    urls.map(
      (url, index) =>
        originalGifResource(index, url)
    );

  const originalGifFetch =
    await runOriginalGifFetch(
      context,
      resources,
      [
        10,
        10,
        10
      ]
    );

  assert.equal(originalGifFetch.summary.successCount, 0);
  assert.equal(originalGifFetch.summary.failureCount, 3);
  assert.equal(originalGifFetch.summary.attemptedCount, 2);
  assert.equal(originalGifFetch.summary.timedOutCount, 1);
  assert.equal(originalGifFetch.summary.rateLimitedCount, 1);
  assert.deepEqual(
    plain(
      originalGifFetch.summary.results.map(
        result => result.skipReason
      )
    ),
    [
      'timeout',
      'http-status-429',
      'batch-message-failed'
    ]
  );
  assert.equal(originalGifFetch.transferMap.size, 0);
  assert.equal(originalGifFetch.results.length, 0);

  const partialWarning =
    context.warnings.find(
      warning =>
        warning.code
        === 'ORIGINAL_GIF_FETCH_PARTIAL'
    );

  assert.equal(partialWarning.count, 3);

  const packagePayload =
    await packageOriginalGifFetch(
      context,
      originalGifFetch
    );

  assert.equal(packagePayload.summary.resourceCount, 0);
  assert.equal(packagePayload.summary.occurrenceLinks.length, 0);
  assert.equal(
    context.mediaDiscovery.resources.every(
      resource =>
        resource.packageResourceId === null
    ),
    true
  );
});
