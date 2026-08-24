const AI_AI_EXTRACTION_VERSION =
  '0.3.30-ai-consumer-payload-1';

let aiAiRunInProgress = false;

let aiAiStatusElement = null;
let aiAiStatusRemovalTimer = null;


chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message.type !== 'AI_AI_RUN') {
      return;
    }

    if (aiAiRunInProgress) {
      showAiAiProcessingToast();

      sendResponse({
        success: false,
        status: 'already-running',
        reason: 'extraction-already-running'
      });

      return false;
    }

    aiAiRunInProgress = true;

    showAiAiProcessingToast();

    runExtraction()
      .then(({
        result,
        fileName,
        delivery
      }) => {
        showAiAiFinalToast(delivery);

        if (
          delivery?.save?.status
          !== 'complete'
        ) {
          sendResponse({
            success: false,
            status: 'delivery-failed',
            fileName,
            reason:
              delivery?.save?.reason
              ?? 'artifact-delivery-failed',
            summary: result.summary
          });

          return;
        }

        sendResponse({
          success: true,
          fileName,
          summary: result.summary
        });
      })
      .catch(error => {
        console.error(
          '[AI_AI] 대형 통합 추출 중 오류:',
          error
        );

        showAiAiFailureToast();

        sendResponse({
          success: false,
          error: String(error)
        });
      })
      .finally(() => {
        aiAiRunInProgress = false;
      });

    return true;
  }
);


function showAiAiProcessingToast() {
  safelyUpdateAiAiToast(
    [
      'AI_AI',
      '⏳ 게시글 처리 중…'
    ],
    {
      state: 'processing',
      autoRemoveMs: null
    }
  );
}


function showAiAiFinalToast(delivery) {
  safelyUpdateAiAiToast(
    buildAiAiFinalToastLines(delivery),
    {
      state:
        delivery?.save?.status
          === 'complete'
          ? 'success'
          : 'failure',
      autoRemoveMs: 7000
    }
  );
}


function showAiAiFailureToast() {
  safelyUpdateAiAiToast(
    [
      'AI_AI',
      '❌ AI_AI 처리 실패'
    ],
    {
      state: 'failure',
      autoRemoveMs: 7000
    }
  );
}


function buildAiAiFinalToastLines(delivery) {
  const lines = ['AI_AI'];

  const artifactKind =
    delivery?.artifactKind;

  const save = delivery?.save;

  if (save?.status !== 'complete') {
    lines.push(
      '❌ AI_AI 처리 실패'
    );

    return lines;
  }

  const artifactLabel =
    artifactKind === 'json-fallback'
      ? 'JSON 결과'
      : 'Package';

  if (save.route === 'custom') {
    lines.push(
      `✅ ${artifactLabel} 저장 완료`
    );
  }
  else if (save.route === 'default') {
    lines.push(
      `✅ ${artifactLabel} 생성 완료`,
      '⬇️ 다운로드 시작됨'
    );

    if (
      save.reason
      && save.reason !== 'default-mode'
    ) {
      lines.push(
        '⚠️ 사용자 지정 폴더 사용 불가 → 기본 다운로드'
      );
    }
  }
  else {
    lines.push(
      '❌ AI_AI 처리 실패'
    );
  }

  return lines;
}


function safelyUpdateAiAiToast(
  lines,
  options
) {
  try {
    updateAiAiToast(lines, options);
    return true;
  }
  catch (error) {
    console.warn(
      '[AI_AI] 상태 toast 표시 실패:',
      String(error)
    );

    return false;
  }
}


function updateAiAiToast(
  lines,
  {
    state,
    autoRemoveMs
  }
) {
  clearAiAiToastRemovalTimer();

  if (
    !aiAiStatusElement
    || !aiAiStatusElement.isConnected
  ) {
    aiAiStatusElement =
      createAiAiStatusElement();
  }

  aiAiStatusElement.textContent =
    lines.join('\n');

  aiAiStatusElement.dataset.state =
    state;

  aiAiStatusElement.style.borderColor =
    state === 'processing'
      ? 'rgba(116, 185, 255, 0.65)'
      : state === 'failure'
        ? 'rgba(255, 118, 118, 0.75)'
        : 'rgba(113, 214, 142, 0.65)';

  if (
    Number.isFinite(autoRemoveMs)
    && autoRemoveMs > 0
  ) {
    aiAiStatusRemovalTimer =
      setTimeout(
        removeAiAiToast,
        autoRemoveMs
      );
  }
}


function createAiAiStatusElement() {
  const parent =
    document.body
    || document.documentElement;

  if (!parent) {
    throw new Error(
      'toast parent unavailable'
    );
  }

  const element =
    document.createElement('div');

  element.id = 'ai-ai-status';

  element.setAttribute(
    'data-ai-ai-ui',
    'status'
  );
  element.setAttribute(
    'role',
    'status'
  );
  element.setAttribute(
    'aria-live',
    'polite'
  );
  element.setAttribute(
    'aria-atomic',
    'true'
  );

  Object.assign(
    element.style,
    {
      all: 'initial',
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483647',
      display: 'block',
      boxSizing: 'border-box',
      maxWidth:
        'min(360px, calc(100vw - 40px))',
      padding: '12px 14px',
      border:
        '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: '9px',
      background:
        'rgba(27, 30, 35, 0.94)',
      color: '#fff',
      boxShadow:
        '0 5px 18px rgba(0, 0, 0, 0.28)',
      font:
        '600 14px/1.55 system-ui, sans-serif',
      whiteSpace: 'pre-line',
      overflowWrap: 'anywhere',
      pointerEvents: 'none'
    }
  );

  parent.appendChild(element);

  return element;
}


function clearAiAiToastRemovalTimer() {
  if (aiAiStatusRemovalTimer !== null) {
    clearTimeout(
      aiAiStatusRemovalTimer
    );

    aiAiStatusRemovalTimer = null;
  }
}


function removeAiAiToast() {
  clearAiAiToastRemovalTimer();

  aiAiStatusElement?.remove();

  aiAiStatusElement = null;
}


async function runExtraction() {
  const startedAtMs = performance.now();
  const warnings = [];
  const errors = [];

  const post = extractPostInfo(warnings);


  const stats = extractPostStats();
  const presentation = extractPresentationState();
  const series = extractSeries();
  const body = extractBody(warnings);

  await enrichBodyPolls(
    body,
    warnings
  );

  const preview = extractPreviewInfo(body);

  let comments;

  try {
    comments = await extractAllComments();
  }
  catch (error) {
    errors.push({
      stage: 'comments',
      message: String(error)
    });

    comments = {
      summary: {
        status: 'failed',
        error: String(error)
      },
      items: [],
      relationAudit: [],
      fetchReports: []
    };
  }

  appendCommentDiagnostics(
    comments,
    warnings
  );

  const mediaDiscovery =
    discoverMediaResources({
      preview,
      body,
      comments
    });

  let mediaFetch;

  try {
    mediaFetch =
      await fetchDiscoveredMedia(
        mediaDiscovery
      );
  }
  catch (error) {
    errors.push({
      stage: 'media-fetch',
      message: String(error)
    });

    mediaFetch = {
      status: 'failed',
      requestedResources: 0,
      completedResources: 0,
      successCount: 0,
      failureCount: 0,
      metadataSuccessCount: 0,
      bodyFetchedCount: 0,
      metadataOnlyCount: 0,
      bodySkippedCount: 0,
      totalFetchedBytes: 0,
      rateLimitedCount: 0,
      timedOutCount: 0,
      retryCount: 0,
      displayOriginalComparisons: [],
      results: [],
      error: String(error)
    };
  }

  const media = {
    discovery: mediaDiscovery,
    fetch: mediaFetch,
  };

  const originalDimensionProbe =
    await probeOriginalImageDimensions({
      mediaDiscovery,
      mediaFetch,
      warnings
    });

  media.originalDimensionProbe =
    originalDimensionProbe;

  const originalGifFetch =
    await fetchOriginalGifBodiesForPackage({
      mediaDiscovery,
      mediaFetch,
      warnings
    });

  media.originalGifFetch =
    originalGifFetch.summary;

  const initialEffectiveMediaFetchForPackage =
    buildEffectiveMediaFetchForPackage(
      mediaFetch,
      originalGifFetch
    );

  const packagePayload =
    await prepareMediaPackageZipTest({
      post,
      mediaDiscovery,
      mediaFetch:
        initialEffectiveMediaFetchForPackage,
      warnings
    });

  media.originalRangeDimensionComparisons =
    buildOriginalRangeDimensionComparisons({
      originalDimensionProbe:
        media.originalDimensionProbe,
      packageSummary:
        packagePayload.summary
    });

  const conditionalOriginalSelection =
    buildConditionalOriginalSelection({
      rangeComparisons:
        media.originalRangeDimensionComparisons,
      packageSummary:
        packagePayload.summary,
      mediaDiscovery
    });

  media.originalPolicySelection =
    conditionalOriginalSelection;

  const conditionalOriginalFetch =
    await fetchConditionalOriginalBodies({
      selection:
        conditionalOriginalSelection,
      warnings
    });

  media.conditionalOriginalFetch =
    conditionalOriginalFetch.summary;

  const effectiveMediaFetchForPackage =
    buildEffectiveMediaFetchForPackage(
      mediaFetch,
      originalGifFetch,
      conditionalOriginalFetch
    );

  await appendConditionalOriginalsToPackage({
    packagePayload,
    conditionalOriginalFetch,
    mediaDiscovery,
    rangeComparisons:
      media.originalRangeDimensionComparisons,
    warnings
  });

  media.packageTest =
    packagePayload.summary;

  attachPackageResourceReferences(
    mediaDiscovery,
    packagePayload.summary.resources
      ?? []
  );

  media.displayOriginalTechnicalComparisons =
    buildDisplayOriginalTechnicalComparisons({
      mediaFetch:
        effectiveMediaFetchForPackage,
      packageSummary:
        packagePayload.summary
    });


  appendMediaDiagnostics(
    media,
    warnings
  );

  appendLinkDiagnostics(
    {
      body,
      comments
    },
    warnings
  );

  const finishedAtMs = performance.now();

  const result = {
    extraction: {
      version:
        AI_AI_EXTRACTION_VERSION,
      generatedAt: new Date().toISOString(),
      source:
        'live-dom + default-image-observation + fetched-comment-pages + service-worker-media-fetch-controller + original-image-range-probe + original-gif-body + conditional-original-body + zip-package-default',
      durationMs:
        Math.round(
          finishedAtMs - startedAtMs
        )
    },

    post,
    stats,
    preview,
    presentation,
    series,
    body,
    comments,
    media,

    diagnostics: {
      warnings,
      errors,
      holds: [
        'default image observation: 0.3.28부터 .article-body의 #defaultImage를 작성자 .article-content와 분리된 preview.defaultImage observation으로 보존한다. 현재 표시 IMG는 default-image occurrence/resource/package 관계로 연결하며 여러 관찰값 중 하나를 canonical 대표 이미지로 임의 선택하지 않는다.',
        'package image dimensions: 0.3.27부터 ZIP에 이미 확보한 이미지 bytes의 PNG/JPEG/GIF/WebP 헤더를 직접 읽어 width/height를 관찰한다. 해상도 관찰만을 위해 createImageBitmap 전체 디코딩은 하지 않으며, 지원하지 못한 형식은 unresolved로 남긴다.',
        'post.modifiedAt: 현재 DOM에서 확정된 추출 규칙이 없어 아직 확정값으로 만들지 않음',
        'recommend/dislike canonical value: DOM 위치별 갱신 시점 차이 때문에 권위값 미확정',
        'media delivery packaging: 0.3.22에서는 표시본을 우선 패키징한 뒤 120 MiB media 목표/128 MiB hard cap 안에서 기술적으로 가치가 높은 원본 이미지를 조건부 추가한다. 더 큰 게시글에서 hard cap을 넘는 경우의 multi-part ZIP 정책은 아직 미확정',
        'ac-o original image body: Range 해상도/전체 크기 관찰을 바탕으로 pixel ratio 1.25 이상 후보를 tier+효율로 정렬하고 패키지 여유 안에서 실제 원본 body를 조건부 수집한다. 0.3.26부터 조건부 full fetch 단계 자체에도 15초 기술 시간 예산을 적용하며, 예산 때문에 시작하지 않은 원본은 skipped-technical-time-budget으로 남긴다. 원본 URL·관계는 보존하며 의미 해석은 적용하지 않는다.',
      ]
    }
  };

  result.summary = buildTopSummary(result);

  const artifactDelivery =
    packagePayload.summary.status
      === 'ready'
      ? await downloadMediaPackageZipTest(
          result,
          packagePayload.files,
          packagePayload.summary.fileName
        )
      : await downloadJsonResult(result);

  return {
    result,
    fileName:
      artifactDelivery.fileName,
    delivery:
      artifactDelivery.delivery
  };
}




function extractPostInfo(warnings) {
  const url = new URL(location.href);
  const pathParts = url.pathname.split('/').filter(Boolean);

  const channel =
    pathParts[0] === 'b'
      ? pathParts[1] ?? null
      : null;

  const postNumber =
    pathParts[0] === 'b'
      ? pathParts[2] ?? null
      : null;

  const titleElement =
    document.querySelector('.article-head .title');

  const titleResult =
    extractTitle(titleElement);

  if (!titleElement) {
    warnings.push({
      stage: 'post',
      code: 'TITLE_ELEMENT_NOT_FOUND'
    });
  }

  const categoryText =
    titleElement
      ?.querySelector('.category-badge')
      ?.textContent
      .trim();

  const category =
    categoryText || null;

  const author =
    document.querySelector(
      '.article-head .member-info .user-info a'
    )
      ?.textContent
      .trim()
    ?? document.querySelector(
      '.article-head .member-info .user-info'
    )
      ?.textContent
      .trim()
    ?? null;

  const channelName =
    document.querySelector(
      '.right .head .title > span'
    )
      ?.textContent
      .trim()
    ?? null;

  const createdTimeElement =
    document.querySelector(
      '.article-info.article-info-section .date time'
    );

  const createdAt =
    createdTimeElement
      ?.textContent
      .trim()
    ?? null;

  const timeCandidates =
    Array.from(
      document.querySelectorAll(
        '.article-head time, .article-info time'
      )
    ).map((time, index) => ({
      index,
      text: time.textContent.trim() || null,
      datetime: time.getAttribute('datetime'),
      className: time.className || null
    }));

  const selfLinkCandidates =
    Array.from(
      document.querySelectorAll(
        '.article-view .article-link a[href]'
      )
    ).map(link => ({
      text: link.textContent.trim() || null,
      rawHref: link.getAttribute('href'),
      resolvedHref: link.href || null
    }));

  return {
    url: location.origin + location.pathname,
    fullUrl: location.href,
    channel,
    channelName,
    postNumber,
    title: titleResult.text,
    titleUnknownElements: titleResult.unknownElements,
    category,
    author,
    createdAt,
    createdAtRawDatetime:
      createdTimeElement?.getAttribute('datetime') ?? null,
    modifiedAt: null,
    timeCandidates,
    selfLinkCandidates
  };
}

function extractTitle(titleElement) {
  if (!titleElement) {
    return {
      text: null,
      unknownElements: []
    };
  }

  const parts = [];
  const unknownElements = [];

  for (const child of titleElement.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent ?? '');
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = child;

    if (element.matches('.category-badge')) {
      continue;
    }

    if (
      element.tagName === 'IMG'
      && element.classList.contains('twemoji')
    ) {
      parts.push(element.alt ?? '');
      continue;
    }

    const fallbackText =
      extractReadableText(element) ?? '';

    parts.push(fallbackText);

    unknownElements.push({
      tagName: element.tagName,
      className: element.className || null,
      text: fallbackText || null
    });
  }

  const text =
    parts.join('').trim() || null;

  return {
    text,
    unknownElements
  };
}

function extractReadableText(element) {
  if (!element) {
    return null;
  }

  const clone = element.cloneNode(true);

  clone
    .querySelectorAll('.category-badge')
    .forEach(element => element.remove());

  clone
    .querySelectorAll('img.twemoji')
    .forEach(image => {
      image.replaceWith(
        document.createTextNode(
          image.alt ?? ''
        )
      );
    });

  return clone.textContent.trim() || null;
}

function extractPostStats() {
  const infoSection =
    document.querySelector(
      '.article-info.article-info-section'
    );

  function getInfoValue(name) {
    if (!infoSection) {
      return null;
    }

    const head =
      Array.from(
        infoSection.querySelectorAll('.head')
      ).find(
        element =>
          element.textContent.trim() === name
      );

    return (
      head
        ?.nextElementSibling
        ?.textContent
        .trim()
      ?? null
    );
  }

  const rateDown =
    document.querySelector('#rateDown');

  const rateDownStyle =
    rateDown
      ? getComputedStyle(rateDown)
      : null;

  return {
    recommend: {
      info: getInfoValue('추천'),
      button:
        document.querySelector('#ratingUp')
          ?.textContent
          .trim()
        ?? null
    },

    dislike: {
      info: getInfoValue('비추천'),
      button:
        document.querySelector('#ratingDown')
          ?.textContent
          .trim()
        ?? null,
      hiddenClass:
        rateDown?.classList.contains('hidden') ?? null,
      renderedDisplay:
        rateDownStyle?.display ?? null,
      renderedVisibility:
        rateDownStyle?.visibility ?? null
    },

    comments: {
      info: getInfoValue('댓글'),
      title:
        document.querySelector(
          '.article-comment .title-comment-count'
        )
          ?.textContent
          .trim()
        ?? null,
      currentDomItems:
        document.querySelectorAll(
          '.article-comment .list-area .comment-item'
        ).length
    },

    viewCount:
      getInfoValue('조회수')
  };
}

function extractPresentationState() {
  const articleBody =
    document.querySelector('.article-body');

  const spoilerAlerts =
    Array.from(
      articleBody?.querySelectorAll(
        '.spoiler-alert-content'
      ) ?? []
    );

  const spoilerFilters =
    Array.from(
      articleBody?.querySelectorAll(
        '.spoiler-filter'
      ) ?? []
    );

  const blurElements =
    Array.from(
      articleBody?.querySelectorAll('.blur') ?? []
    );

  return {
    spoiler: {
      alertCount: spoilerAlerts.length,
      alertTexts:
        spoilerAlerts
          .map(element =>
            element.textContent.trim()
          )
          .filter(Boolean),

      alerts:
        spoilerAlerts.map(
          (element, index) => {
            const style =
              getComputedStyle(element);

            return {
              index,
              tagName: element.tagName,
              className:
                element.className || null,
              text:
                element.textContent.trim()
                || null,
              hiddenAttribute:
                element.hasAttribute('hidden'),
              ariaHidden:
                element.getAttribute('aria-hidden'),
              display:
                style.display,
              visibility:
                style.visibility
            };
          }
        ),

      filterCount: spoilerFilters.length,
      activeFilterCount:
        spoilerFilters.filter(
          element =>
            element.classList.contains('active')
        ).length,

      filters:
        spoilerFilters.map(
          (element, index) => {
            const style =
              getComputedStyle(element);

            return {
              index,
              tagName: element.tagName,
              className:
                element.className || null,
              active:
                element.classList.contains(
                  'active'
                ),
              display:
                style.display,
              visibility:
                style.visibility
            };
          }
        )
    },

    blur: {
      count: blurElements.length,
      elements:
        blurElements
          .slice(0, 20)
          .map(
            (element, index) => ({
              index,
              tagName: element.tagName,
              className:
                element.className || null,
              text:
                element.textContent.trim()
                || null
            })
          )
    }
  };
}

function extractSeries() {
  const articleBody =
    document.querySelector('.article-body');

  if (!articleBody) {
    return {
      hasSeries: false,
      name: null,
      renderedListCount: 0,
      items: [],
      currentIndex: null,
      renderedLists: []
    };
  }

  const label =
    articleBody.querySelector('.read-series-title');

  const seriesName =
    label?.nextElementSibling?.textContent.trim()
    || null;

  const containers =
    Array.from(
      articleBody.querySelectorAll('.article-series')
    );

  const renderedLists =
    containers.map((container, listIndex) => {
      const links =
        Array.from(
          container.querySelectorAll(
            '.series-link > a[href]'
          )
        ).map((link, itemIndex) => {
          const href =
            link.href || link.getAttribute('href');

          let pathname = null;

          try {
            pathname =
              new URL(href, location.origin).pathname;
          }
          catch {
            pathname = null;
          }

          return {
            listIndex,
            itemIndex,
            title: extractReadableText(link),
            rawHref: link.getAttribute('href'),
            href: href || null,
            pathname,
            isCurrent:
              pathname === location.pathname
          };
        });

      return {
        listIndex,
        extended:
          container.classList.contains('extend'),
        itemCount: links.length,
        items: links
      };
    });

  const uniqueByPath = new Map();

  for (const list of renderedLists) {
    for (const item of list.items) {
      const key =
        item.pathname
        || item.href
        || `${list.listIndex}:${item.itemIndex}`;

      if (!uniqueByPath.has(key)) {
        uniqueByPath.set(key, {
          order: uniqueByPath.size,
          title: item.title,
          href: item.href,
          pathname: item.pathname,
          isCurrent: item.isCurrent
        });
      }
    }
  }

  const items =
    Array.from(uniqueByPath.values());

  const currentIndex =
    items.findIndex(item => item.isCurrent);

  return {
    hasSeries:
      Boolean(label) || containers.length > 0,
    name: seriesName,
    renderedListCount: containers.length,
    renderedLists,
    duplicateListsIdentical:
      renderedLists.length >= 2
        ? JSON.stringify(
            renderedLists[0].items.map(
              item => [item.pathname, item.title]
            )
          )
          === JSON.stringify(
            renderedLists[1].items.map(
              item => [item.pathname, item.title]
            )
          )
        : null,
    items,
    currentIndex:
      currentIndex >= 0
        ? currentIndex
        : null
  };
}

function extractBody(warnings) {
  const root =
    document.querySelector('.article-content');

  if (!root) {
    warnings.push({
      stage: 'body',
      code: 'ARTICLE_CONTENT_NOT_FOUND'
    });

    return {
      sequence: [],
      summary: {
        itemCount: 0,
        textItems: 0,
        links: 0,
        images: 0,
        unaddressableImages: 0,
        videos: 0,
        iframes: 0,
        audios: 0,
        horizontalRules: 0,
        twemoji: 0,
        unknownElements: 0
      },
      unknownElements: []
    };
  }

  const sequence = [];
  const unknownElements = [];

  walk(root);

  const summary = {
    itemCount: sequence.length,
    textItems:
      sequence.filter(item => item.type === 'text').length,
    links:
      sequence.filter(item => item.type === 'link').length,
    images:
      sequence.filter(item => item.type === 'image').length,
    unaddressableImages:
      sequence.filter(
        item => item.type === 'unaddressableImage'
      ).length,
    videos:
      sequence.filter(item => item.type === 'video').length,
    iframes:
      sequence.filter(item => item.type === 'iframe').length,
    audios:
      sequence.filter(item => item.type === 'audio').length,
    horizontalRules:
      sequence.filter(item => item.type === 'horizontalRule').length,
    twemoji:
      sequence.filter(
        item => item.type === 'text' && item.source === 'twemoji'
      ).length,
    unknownElements: unknownElements.length
  };

  return {
    sequence,
    summary,
    unknownElements
  };

  function walk(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent.trim() !== '') {
          sequence.push({
            type: 'text',
            text: child.textContent
          });
        }

        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      const element = child;
      const tag = element.tagName;

      if (
        tag === 'IMG'
        && element.classList.contains('twemoji')
      ) {
        sequence.push({
          type: 'text',
          text: element.alt ?? '',
          source: 'twemoji'
        });
        continue;
      }

      if (tag === 'BR') {
        sequence.push({
          type: 'lineBreak'
        });
        continue;
      }

      if (tag === 'HR') {
        sequence.push({
          type: 'horizontalRule'
        });
        continue;
      }

      if (tag === 'IMG') {
        sequence.push(
          extractLiveImage(element)
        );
        continue;
      }

      if (tag === 'VIDEO') {
        sequence.push(
          extractLiveVideo(element)
        );
        continue;
      }

      if (tag === 'IFRAME') {
        const iframeSrcRaw =
          element.getAttribute('src');

        const iframeSrc =
          element.src
          || resolveUrl(
            iframeSrcRaw
          );

        const className =
          element.className || null;

        const voteId =
          element.classList.contains(
            'arca-vote'
          )
            ? extractArcaVoteId(
                iframeSrc
              )
            : null;

        sequence.push({
          type: 'iframe',

          srcRaw:
            iframeSrcRaw,

          src:
            iframeSrc,

          title:
            element.getAttribute(
              'title'
            ),

          className,

          embeddedTargetUrl:
            extractEmbeddedTargetUrl(
              iframeSrc
            ),

          embeddedType:
            voteId
              ? 'poll'
              : null,

          poll:
            voteId
              ? {
                  status:
                    'candidate',

                  voteId,

                  endpoints: {
                    detail:
                      iframeSrc,

                    result:
                      new URL(
                        `/api/vote_result/${encodeURIComponent(voteId)}`,
                        location.origin
                      ).href
                  },

                  observations: []
                }
              : null
        });

        continue;
      }
      if (tag === 'AUDIO') {
        sequence.push(
          extractAudioElement(element)
        );
        continue;
      }

      if (tag === 'A') {
        const href =
          element.href
          || element.getAttribute('href')
          || null;

        const hasMedia =
          element.querySelector(
            'img, video, iframe, audio'
          );

        if (hasMedia) {
          const startIndex = sequence.length;
          walk(element);

          const parentLinkInfo =
            makeUrlReference(href);

          for (
            let i = startIndex;
            i < sequence.length;
            i++
          ) {
            sequence[i].parentLink = href;
            sequence[i].parentLinkInfo =
              parentLinkInfo;
          }
        }
        else {
          sequence.push({
            type: 'link',
            ...extractLinkInfo(
              element,
              extractReadableText(element)
            )
          });
        }

        continue;
      }

      if (isBlockTag(tag)) {
        sequence.push({
          type: 'blockStart',
          tag: tag.toLowerCase(),
          className: element.className || null
        });

        walk(element);

        sequence.push({
          type: 'blockEnd',
          tag: tag.toLowerCase()
        });
        continue;
      }

      if (isFormatTag(tag)) {
        sequence.push({
          type: 'formatStart',
          tag: tag.toLowerCase()
        });

        walk(element);

        sequence.push({
          type: 'formatEnd',
          tag: tag.toLowerCase()
        });
        continue;
      }

      if (tag === 'SPAN' || tag === 'DIV') {
        walk(element);
        continue;
      }

      unknownElements.push({
        order: unknownElements.length,
        tagName: tag,
        className: element.className || null,
        text: element.textContent.trim() || null,
        htmlSnippet:
          element.outerHTML?.slice(0, 1000) ?? null
      });

      if (tag === 'BUTTON') {
        continue;
      }

      walk(element);
    }
  }
}

function extractArcaVoteId(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed =
      new URL(
        url,
        location.href
      );

    if (
      parsed.origin !== location.origin
    ) {
      return null;
    }

    const match =
      parsed.pathname.match(
        /^\/api\/vote_detail\/([^/]+)$/
      );

    return (
      match?.[1]
      ?? null
    );
  }
  catch {
    return null;
  }
}

async function enrichBodyPolls(
  body,
  warnings
) {
  const pollItems =
    body?.sequence?.filter(
      item =>
        item.type === 'iframe'
        && item.embeddedType === 'poll'
        && item.poll?.voteId
    )
    ?? [];

  if (body?.summary) {
    body.summary.polls =
      pollItems.length;
  }

  if (pollItems.length === 0) {
    return;
  }

  const liveVoteIframes =
    Array.from(
      document.querySelectorAll(
        '.article-content iframe.arca-vote'
      )
    );

  for (
    let pollIndex = 0;
    pollIndex < pollItems.length;
    pollIndex++
  ) {
    const item =
      pollItems[pollIndex];

    const observations = [];

    const liveIframe =
      liveVoteIframes[pollIndex]
      ?? null;

    if (liveIframe) {
      try {
        observations.push({
          source:
            'live-iframe',

          currentUrl:
            liveIframe.contentWindow
              ?.location
              ?.href
            ?? null,

          observation:
            inspectArcaVoteDocument(
              liveIframe.contentDocument
            )
        });
      }
      catch (error) {
        const message =
          error?.message
          ?? String(error);

        observations.push({
          source:
            'live-iframe',

          error: {
            name:
              error?.name
              ?? null,

            message
          }
        });

        warnings.push({
          stage:
            'poll',

          code:
            'POLL_LIVE_IFRAME_READ_FAILED',

          voteId:
            item.poll.voteId,

          message
        });
      }
    }
    else {
      warnings.push({
        stage:
          'poll',

        code:
          'POLL_LIVE_IFRAME_NOT_FOUND',

        voteId:
          item.poll.voteId,

        pollIndex
      });
    }

    const detailObservation =
      await fetchArcaVoteObservation(
        item.poll.endpoints.detail,
        'detail-fetch'
      );

    observations.push(
      detailObservation
    );

    if (!detailObservation.ok) {
      warnings.push({
        stage:
          'poll',

        code:
          'POLL_DETAIL_FETCH_FAILED',

        voteId:
          item.poll.voteId,

        status:
          detailObservation.status
          ?? null,

        message:
          detailObservation.error
            ?.message
          ?? null
      });
    }

    const resultObservation =
      await fetchArcaVoteObservation(
        item.poll.endpoints.result,
        'result-fetch'
      );

    observations.push(
      resultObservation
    );

    if (!resultObservation.ok) {
      warnings.push({
        stage:
          'poll',

        code:
          'POLL_RESULT_FETCH_FAILED',

        voteId:
          item.poll.voteId,

        status:
          resultObservation.status
          ?? null,

        message:
          resultObservation.error
            ?.message
          ?? null
      });
    }

    item.poll.status =
      observations.some(
        entry =>
          Boolean(
            entry.observation
          )
      )
        ? 'observed'
        : 'failed';

    item.poll.observations =
      observations;
  }
}

async function fetchArcaVoteObservation(
  url,
  source
) {
  if (!url) {
    return {
      source,

      requestUrl:
        url,

      ok:
        false,

      error: {
        name:
          'MissingUrl',

        message:
          'Vote URL is missing.'
      }
    };
  }

  try {
    const response =
      await fetch(
        url,
        {
          method:
            'GET',

          credentials:
            'include'
        }
      );

    const contentType =
      response.headers.get(
        'content-type'
      );

    const responseText =
      await response.text();

    let observation =
      null;

    if (response.ok) {
      const parsedDocument =
        new DOMParser()
          .parseFromString(
            responseText,
            'text/html'
          );

      observation =
        inspectArcaVoteDocument(
          parsedDocument
        );
    }

    return {
      source,

      requestUrl:
        url,

      responseUrl:
        response.url
        || null,

      ok:
        response.ok,

      status:
        response.status,

      contentType,

      observation
    };
  }
  catch (error) {
    return {
      source,

      requestUrl:
        url,

      ok:
        false,

      error: {
        name:
          error?.name
          ?? null,

        message:
          error?.message
          ?? String(error)
      }
    };
  }
}

function inspectArcaVoteDocument(doc) {
  if (!doc?.body) {
    return null;
  }

  function getText(element) {
    return (
      element
        ?.textContent
        ?.trim()
      || null
    );
  }

  const statusElement =
    doc.querySelector(
      '.vote-status'
    );

  const titleElement =
    doc.querySelector(
      '.vote-title'
    );

  const infoSpans =
    Array.from(
      doc.querySelectorAll(
        '.vote-info > span'
      )
    );

  const participantText =
    getText(
      infoSpans[0]
    );

  const permissionText =
    getText(
      infoSpans[1]
    );

  const timeElement =
    doc.querySelector(
      '.vote-info time'
    );

  const selectionNotice =
    getText(
      doc.querySelector(
        '.selection-notice'
      )
    );

  const actionElement =
    doc.querySelector(
      '.will-hidden .vote-button:not(.result)'
    );

  const selectableOptions =
    Array.from(
      doc.querySelectorAll(
        '.vote-option-label'
      )
    ).map(
      (label, order) => {
        const inputId =
          label.getAttribute(
            'for'
          );

        const input =
          inputId
            ? doc.getElementById(
                inputId
              )
            : null;

        return {
          order,

          id:
            input?.value
            ?? null,

          inputId:
            input?.id
            ?? inputId
            ?? null,

          inputType:
            input
              ?.getAttribute(
                'type'
              )
            ?? null,

          text:
            getText(
              label
            ),

          checked:
            input
              ? input.checked
              : null,

          disabled:
            input
              ? input.disabled
              : null
        };
      }
    );

  const results =
    Array.from(
      doc.querySelectorAll(
        '.vote-result-container .vote-option'
      )
    ).map(
      (option, order) => {
        const optionText =
          getText(
            option.querySelector(
              '.vote-option-text'
            )
          );

        const resultText =
          getText(
            option.querySelector(
              '.vote-option-count'
            )
          );

        const percentageElement =
          option.querySelector(
            '.percentage'
          );

        return {
          order,

          text:
            optionText,

          resultText,

          percent:
            parseObservedNumber(
              resultText,
              /([\d.]+)\s*%/
            ),

          selectedByCount:
            parseObservedNumber(
              resultText,
              /\((\d+)명\)/
            ),

          renderedBarWidth:
            percentageElement
              ?.style
              ?.width
            || null
        };
      }
    );

  let viewType =
    'unknown';

  if (
    doc.querySelector(
      '.vote-result-container'
    )
  ) {
    viewType =
      'result';
  }
  else if (
    doc.querySelector(
      '.vote_detail_content'
    )
  ) {
    viewType =
      'detail';
  }

  return {
    viewType,

    status: {
      text:
        getText(
          statusElement
        ),

      className:
        statusElement
          ?.className
        || null
    },

    title:
      getText(
        titleElement
      ),

    participant: {
      text:
        participantText,

      count:
        parseObservedNumber(
          participantText,
          /현재\s*(\d+)명\s*참여/
        )
    },

    permission:
      permissionText,

    endTime: {
      displayedText:
        getText(
          timeElement
        ),

      datetime:
        timeElement
          ?.getAttribute(
            'datetime'
          )
        || null
    },

    maxSelection: {
      text:
        selectionNotice,

      count:
        parseObservedNumber(
          selectionNotice,
          /최대\s*(\d+)개/
        )
    },

    userActionObservation:
      actionElement
        ? {
            text:
              getText(
                actionElement
              ),

            className:
              actionElement
                .className
              || null
          }
        : null,

    selectableOptions,

    results
  };
}

function parseObservedNumber(
  value,
  regex
) {
  if (!value) {
    return null;
  }

  const match =
    value.match(
      regex
    );

  if (!match) {
    return null;
  }

  const number =
    Number(
      match[1]
    );

  return (
    Number.isFinite(number)
      ? number
      : null
  );
}
function isBlockTag(tag) {
  return [
    'P',
    'BLOCKQUOTE',
    'PRE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'UL',
    'OL',
    'LI',
    'TABLE',
    'THEAD',
    'TBODY',
    'TFOOT',
    'TR',
    'TH',
    'TD'
  ].includes(tag);
}

function isFormatTag(tag) {
  return [
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'S',
    'DEL',
    'CODE'
  ].includes(tag);
}

function extractLiveImage(element) {
  const style =
    getComputedStyle(element);

  const image = {
    type: 'image',
    srcRaw: element.getAttribute('src'),
    src: element.src || null,
    currentSrc: element.currentSrc || null,
    dataSrc: element.dataset.src || null,
    originalUrl: element.dataset.originalurl || null,
    alt: element.alt || null,
    title: element.title || null,
    className: element.className || null,
    dataId: element.dataset.id || null,
    dataStoreId: element.dataset.storeId || null,
    htmlWidth: element.getAttribute('width'),
    htmlHeight: element.getAttribute('height'),
    naturalWidth: element.naturalWidth || null,
    naturalHeight: element.naturalHeight || null,
    renderedWidth: element.getBoundingClientRect().width,
    renderedHeight: element.getBoundingClientRect().height,
    display: style.display,
    visibility: style.visibility
  };

  const hasUrlEvidence = [
    image.srcRaw,
    image.src,
    image.currentSrc,
    image.dataSrc,
    image.originalUrl
  ].some(
    value =>
      typeof value === 'string'
      && value.trim() !== ''
  );

  if (
    !hasUrlEvidence
    && image.renderedWidth === 0
    && image.renderedHeight === 0
  ) {
    return {
      ...image,
      type: 'unaddressableImage',
      addressability: {
        status: 'unaddressable',
        reason:
          'no-url-evidence-and-zero-rendered-size'
      }
    };
  }

  return image;
}

function extractLiveVideo(element) {
  const style =
    getComputedStyle(element);

  return {
    type: 'video',
    srcRaw: element.getAttribute('src'),
    src: element.src || null,
    currentSrc: element.currentSrc || null,
    dataSrc: element.dataset.src || null,
    originalUrl: element.dataset.originalurl || null,
    posterRaw: element.getAttribute('poster'),
    poster: element.poster || null,
    className: element.className || null,
    controls: element.controls,
    dataStoreId: element.dataset.storeId || null,
    dataId: element.dataset.id || null,
    dataOrig: element.dataset.orig || null,
    dataVersion: element.dataset.version || null,
    htmlWidth: element.getAttribute('width'),
    htmlHeight: element.getAttribute('height'),
    videoWidth: element.videoWidth || null,
    videoHeight: element.videoHeight || null,
    renderedWidth: element.getBoundingClientRect().width,
    renderedHeight: element.getBoundingClientRect().height,
    display: style.display,
    visibility: style.visibility,
    technicalSignals: {
      dataOrigGif:
        element.dataset.orig === 'gif',
      hasStoreId:
        Boolean(element.dataset.storeId),
      hasDataId:
        Boolean(element.dataset.id)
    }
  };
}

function extractAudioElement(audio) {
  return {
    type: 'audio',
    controls: audio.controls,
    srcRaw: audio.getAttribute('src'),
    src: audio.src || null,
    currentSrc: audio.currentSrc || null,
    sources:
      Array.from(
        audio.querySelectorAll('source')
      ).map(source =>
        extractAudioSource(source)
      )
  };
}

function extractAudioSource(source) {
  const raw =
    source.getAttribute('src');

  const resolved =
    resolveUrl(raw);

  let pathname = null;
  let fileName = null;
  let stem = null;

  if (resolved) {
    try {
      const parsed = new URL(resolved);
      pathname = parsed.pathname;
      fileName =
        pathname.split('/').filter(Boolean).at(-1)
        ?? null;
      stem =
        fileName?.replace(/\.[^.]+$/, '')
        ?? null;
    }
    catch {
      pathname = null;
    }
  }

  return {
    srcRaw: raw,
    src: resolved,
    htmlType: source.getAttribute('type'),
    pathname,
    fileName,
    stemCandidate: stem
  };
}

function extractPreviewInfo(body) {
  const ogImageRaw =
    document.querySelector(
      'meta[property="og:image"]'
    )?.content
    ?? null;

  const twitterImageRaw =
    document.querySelector(
      'meta[name="twitter:image"]'
    )?.content
    ?? null;

  const firstBodyMedia =
    body.sequence.find(
      item =>
        item.type === 'image'
        || item.type === 'video'
        || item.type === 'iframe'
    )
    ?? null;

  const defaultImage =
    extractDefaultImageObservation();

  return {
    ogImageRaw,
    ogImage:
      resolveUrl(ogImageRaw),

    twitterImageRaw,
    twitterImage:
      resolveUrl(twitterImageRaw),

    firstBodyMedia,

    // #defaultImage는 .article-content 내부의 작성자 본문 미디어가 아니다.
    // 따라서 firstBodyMedia와 합치지 않고 별도 observation으로 보존한다.
    defaultImage
  };
}


function extractDefaultImageObservation() {
  const articleBody =
    document.querySelector(
      '.article-body'
    );

  if (!articleBody) {
    return {
      exists: false,
      selector:
        '#defaultImage',
      location:
        '.article-body',
      elementCount: 0,
      images: [],
      reason:
        'article-body-not-found'
    };
  }

  const elements =
    Array.from(
      articleBody.querySelectorAll(
        '#defaultImage'
      )
    );

  if (elements.length === 0) {
    return {
      exists: false,
      selector:
        '#defaultImage',
      location:
        '.article-body',
      elementCount: 0,
      images: [],
      reason:
        'default-image-not-found'
    };
  }

  const elementObservations =
    elements.map(
      (element, elementIndex) => {
        const style =
          getComputedStyle(
            element
          );

        const rect =
          element.getBoundingClientRect();

        const imageElements = [];

        if (
          element.tagName === 'IMG'
        ) {
          imageElements.push(
            element
          );
        }

        for (
          const image
          of element.querySelectorAll(
            'img'
          )
        ) {
          if (
            !imageElements.includes(
              image
            )
          ) {
            imageElements.push(
              image
            );
          }
        }

        const images =
          imageElements.map(
            (image, imageIndex) => ({
              elementIndex,
              imageIndex,
              relationToDefaultImage:
                image === element
                  ? 'self'
                  : 'descendant',
              ...extractLiveImage(
                image
              ),
              hiddenAttribute:
                image.hasAttribute(
                  'hidden'
                ),
              ariaHidden:
                image.getAttribute(
                  'aria-hidden'
                )
            })
          );

        return {
          elementIndex,
          tagName:
            element.tagName,
          id:
            element.id || null,
          className:
            element.className
            || null,
          parentTagName:
            element.parentElement
              ?.tagName
            ?? null,
          parentClassName:
            element.parentElement
              ?.className
            || null,
          directChildOfArticleBody:
            element.parentElement
            === articleBody,
          hiddenAttribute:
            element.hasAttribute(
              'hidden'
            ),
          ariaHidden:
            element.getAttribute(
              'aria-hidden'
            ),
          display:
            style.display,
          visibility:
            style.visibility,
          opacity:
            style.opacity,
          renderedWidth:
            rect.width,
          renderedHeight:
            rect.height,
          imageCount:
            images.length,
          images
        };
      }
    );

  const images =
    elementObservations.flatMap(
      observation =>
        observation.images
    );

  return {
    exists: true,
    selector:
      '#defaultImage',
    location:
      '.article-body',
    elementCount:
      elementObservations.length,
    elements:
      elementObservations,
    imageCount:
      images.length,
    images,
    // 여러 DOM 관찰값이 있을 수 있으므로 하나를 canonical로 고르지 않는다.
    canonicalImageSelected:
      false
  };
}

async function extractAllComments() {
  const liveCommentDisplayStates =
    collectLiveCommentDisplayStates();

  const baseUrl =
    new URL(
      location.origin + location.pathname
    );

  const collectionStarted =
    performance.now();

  // ------------------------------------------------------------
  // 0.3.2 변경:
  //
  // 현재 브라우저 화면에 이미 댓글 DOM이 존재하는데도
  // 이전 0.3.1은 게시글 기본 페이지를 다시 fetch했다.
  //
  // 실제 시험에서 이 재요청 하나가 27초 넘게 걸리거나
  // TypeError: Failed to fetch로 실패한 사례가 나왔다.
  //
  // 따라서 현재 화면의 댓글 페이지는 네트워크 요청 없이
  // document에서 그대로 재사용한다.
  //
  // 댓글이 여러 페이지일 때만 "현재 화면에 없는 나머지 페이지"를
  // 추가 fetch한다.
  // ------------------------------------------------------------

  const activePageText =
    document.querySelector(
      '.article-comment .pagination .page-item.active .page-link'
    )
      ?.textContent
      .trim()
    ?? null;

  const activePageNumber =
    activePageText && /^\d+$/.test(activePageText)
      ? Number(activePageText)
      : 1;

  const numericPageNumbers =
    Array.from(
      document.querySelectorAll(
        '.article-comment .pagination .page-link'
      )
    )
      .map(element => element.textContent.trim())
      .filter(text => /^\d+$/.test(text))
      .map(Number);

  const detectedLastPage =
    Math.max(
      1,
      activePageNumber,
      ...numericPageNumbers
    );

  const displayedCommentText =
    document.querySelector(
      '.article-comment .title-comment-count'
    )
      ?.textContent
      .trim()
    ?? null;

  const displayedCommentCount =
    displayedCommentText
      ? Number(
          displayedCommentText.replace(
            /[^0-9]/g,
            ''
          )
        )
      : null;

  const livePageElements =
    Array.from(
      document.querySelectorAll(
        '.article-comment .list-area .comment-item'
      )
    );

  const livePageComments =
    livePageElements.map(
      (comment, pageIndex) =>
        extractComment(
          comment,
          activePageNumber,
          pageIndex,
          liveCommentDisplayStates.get(comment.id)
            ?? extractFetchedCommentDisplayEvidence(comment)
        )
    );

  const allPageNumbers =
    Array.from(
      { length: detectedLastPage },
      (_, index) => index + 1
    );

  const remainingPageNumbers =
    allPageNumbers.filter(
      page => page !== activePageNumber
    );

  const remainingPageResults =
    await mapWithConcurrency(
      remainingPageNumbers,
      4,
      async cp => {
        const startedAt =
          performance.now();

        const url =
          new URL(baseUrl.href);

        url.searchParams.set(
          'cp',
          String(cp)
        );

        const timeoutMs = 10000;

        for (
          let attempt = 0;
          attempt < 2;
          attempt++
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
                url.href,
                {
                  credentials: 'same-origin',
                  cache: 'default',
                  signal: controller.signal
                }
              );

            if (
              (
                response.status === 429
                || response.status >= 500
              )
              && attempt === 0
            ) {
              try {
                await response.body?.cancel();
              }
              catch {
                // 재시도 전에 응답 body를 정리하지 못해도
                // 본래 상태 코드를 우선한다.
              }

              clearTimeout(timeoutId);

              await new Promise(
                resolve =>
                  setTimeout(
                    resolve,
                    response.status === 429
                      ? 1000
                      : 500
                  )
              );

              continue;
            }

            if (!response.ok) {
              return {
                page: cp,
                source: 'fetched-html',
                ok: false,
                status: response.status,
                error:
                  `HTTP ${response.status}`,
                attempts:
                  attempt + 1,
                durationMs:
                  Math.round(
                    performance.now()
                    - startedAt
                  ),
                comments: []
              };
            }

            const html =
              await response.text();

            const doc =
              new DOMParser().parseFromString(
                html,
                'text/html'
              );

            const commentElements =
              Array.from(
                doc.querySelectorAll(
                  '.article-comment .list-area .comment-item'
                )
              );

            const comments =
              commentElements.map(
                (comment, pageIndex) =>
                  extractComment(
                    comment,
                    cp,
                    pageIndex,
                    liveCommentDisplayStates.get(comment.id)
                      ?? extractFetchedCommentDisplayEvidence(comment)
                  )
              );

            return {
              page: cp,
              source: 'fetched-html',
              ok: true,
              status: response.status,
              error: null,
              attempts:
                attempt + 1,
              durationMs:
                Math.round(
                  performance.now()
                  - startedAt
                ),
              comments
            };
          }
          catch (error) {
            const timedOut =
              error?.name === 'AbortError';

            if (
              !timedOut
              && attempt === 0
            ) {
              clearTimeout(timeoutId);

              await new Promise(
                resolve =>
                  setTimeout(
                    resolve,
                    500
                  )
              );

              continue;
            }

            return {
              page: cp,
              source: 'fetched-html',
              ok: false,
              status: null,
              error:
                timedOut
                  ? `timeout after ${timeoutMs}ms`
                  : String(error),
              attempts:
                attempt + 1,
              durationMs:
                Math.round(
                  performance.now()
                  - startedAt
                ),
              comments: []
            };
          }
          finally {
            clearTimeout(timeoutId);
          }
        }

        return {
          page: cp,
          source: 'fetched-html',
          ok: false,
          status: null,
          error:
            '댓글 페이지 fetch 재시도 종료',
          attempts: 2,
          durationMs:
            Math.round(
              performance.now()
              - startedAt
            ),
          comments: []
        };
      }
    );

  const pageResults = [
    {
      page: activePageNumber,
      source: 'live-dom',
      ok: true,
      status: null,
      error: null,
      attempts: 0,
      durationMs: 0,
      comments:
        livePageComments
    },
    ...remainingPageResults
  ];

  pageResults.sort(
    (a, b) => a.page - b.page
  );

  const allComments = [];

  for (const pageResult of pageResults) {
    for (const comment of pageResult.comments) {
      comment.order =
        allComments.length;

      allComments.push(comment);
    }
  }

  const relationAudit =
    validateCommentRelations(
      allComments
    );

  const summary =
    buildCommentSummary({
      detectedLastPage,
      displayedCommentCount,
      allComments,
      pageResults,
      relationAudit,
      commentCollectionDurationMs:
        Math.round(
          performance.now()
          - collectionStarted
        )
    });

  return {
    summary,
    items:
      allComments,
    relationAudit,
    fetchReports:
      pageResults.map(
        result => ({
          page:
            result.page,
          source:
            result.source
            ?? null,
          ok:
            result.ok,
          status:
            result.status,
          error:
            result.error
            ?? null,
          attempts:
            result.attempts
            ?? null,
          durationMs:
            result.durationMs,
          extractedItems:
            result.comments.length
        })
      )
  };
}


function extractComment(
  comment,
  page,
  pageIndex,
  displayState = null
) {
  const content =
    comment.querySelector(
      ':scope > .content'
    );

  const message =
    content?.querySelector(
      ':scope > .message'
    )
    ?? null;

  const messagePre =
    message?.querySelector(
      '.text pre'
    )
    ?? null;

  const directPre =
    content?.querySelector(
      ':scope > .text > pre'
    )
    ?? null;

  const messageText =
    normalizeText(
      messagePre?.textContent
    );

  const directText =
    normalizeText(
      directPre?.textContent
    );

  const contentPre =
    messageText
      ? messagePre
      : directText
        ? directPre
        : messagePre
          ?? directPre
          ?? null;

  const text =
    normalizeText(
      contentPre?.textContent
    )
    || null;

  const textSource =
    messageText
      ? 'message'
      : directText
        ? 'direct'
        : null;

  const links =
    Array.from(
      contentPre?.querySelectorAll('a')
      ?? []
    ).map(link =>
      extractLinkInfo(link)
    );

  const contentParts =
    getCommentContentParts(
      textSource === 'direct'
        ? contentPre
        : message ?? contentPre
    );

  const linkCard =
    content?.querySelector(
      ':scope > a.link-card-link'
    )
    ?? null;

  if (linkCard) {
    contentParts.push({
      type: 'linkCard',
      rawHref:
        linkCard.getAttribute('href'),
      href:
        resolveUrl(
          linkCard.getAttribute('href')
        ),
      text:
        linkCard.textContent.trim()
        || null
    });
  }

  const emoticons =
    Array.from(
      message?.querySelectorAll('.emoticon')
      ?? []
    ).map((emoticon, occurrenceIndex) => ({
      occurrenceIndex,
      tagName: emoticon.tagName,
      dataId: emoticon.dataset.id || null,
      dataStoreId:
        emoticon.dataset.storeId || null,
      rawSrc: emoticon.getAttribute('src'),
      src: resolveUrl(
        emoticon.getAttribute('src')
        || emoticon.dataset.src
      ),
      dataSrc: emoticon.dataset.src || null,
      rawPoster:
        emoticon.getAttribute('poster'),
      poster:
        resolveUrl(
          emoticon.getAttribute('poster')
        ),
      dataOrig: emoticon.dataset.orig || null,
      dataVersion:
        emoticon.dataset.version || null,
      className:
        emoticon.className || null
    }));

  const audios =
    Array.from(
      message?.querySelectorAll('audio')
      ?? []
    ).map((audio, occurrenceIndex) => ({
      occurrenceIndex,
      ...extractAudioElement(audio)
    }));

  const wrapper =
    comment.closest('.comment-wrapper');

  const parentWrapper =
    wrapper
      ?.parentElement
      ?.classList.contains('comment-wrapper')
      ? wrapper.parentElement
      : null;

  const parentComment =
    parentWrapper
      ?.querySelector(
        ':scope > .comment-item'
      )
    ?? null;

  let replyDepth = 0;
  let currentWrapper = wrapper;

  while (
    currentWrapper
      ?.parentElement
      ?.classList.contains('comment-wrapper')
  ) {
    replyDepth++;
    currentWrapper =
      currentWrapper.parentElement;
  }

  const replyTargetLink =
    content?.querySelector(
      ':scope > .info-row > a[href*="#c_"]'
    )
    ?? null;

  const replyTargetHref =
    replyTargetLink?.getAttribute('href')
    ?? null;

  const replyTargetMatch =
    replyTargetHref?.match(/#(c_\d+)/);

  const timeElement =
    comment.querySelector('time');

  return {
    order: null,
    page,
    pageOrder: pageIndex,
    commentId: comment.id || null,
    type:
      replyDepth > 0
        ? 'reply'
        : 'root',
    replyDepth,
    parentCommentId:
      parentComment?.id ?? null,
    replyTargetId:
      replyTargetMatch?.[1] ?? null,
    author:
      getCommentAuthor(comment),
    createdAt:
      formatKoreaTime(timeElement),
    createdAtRawDatetime:
      timeElement?.getAttribute('datetime')
      ?? null,
    modified:
      Boolean(
        comment.querySelector('.modified')
      ),
    deleted:
      comment.classList.contains('deleted'),
    displayState,
    text,
    textSource,
    links,
    contentParts,
    linkCard:
      linkCard
        ? {
            rawHref:
              linkCard.getAttribute('href'),
            href:
              resolveUrl(
                linkCard.getAttribute('href')
              ),
            text:
              linkCard.textContent.trim()
              || null
          }
        : null,
    emoticons,
    audios
  };
}


function collectLiveCommentDisplayStates() {
  const states = new Map();

  const comments =
    document.querySelectorAll(
      '.article-comment .list-area .comment-item'
    );

  for (const comment of comments) {
    if (!comment.id) {
      continue;
    }

    const content =
      comment.querySelector(
        ':scope > .content'
      );

    const message =
      content?.querySelector(
        ':scope > .message'
      )
      ?? null;

    const expandControl =
      message?.querySelector('.btn-more')
      ?? null;

    const messageStyle =
      message
        ? getComputedStyle(message)
        : null;

    const expandStyle =
      expandControl
        ? getComputedStyle(expandControl)
        : null;

    const expandControlVisible =
      expandControl
        ? (
            expandStyle.display !== 'none'
            && expandStyle.visibility !== 'hidden'
            && expandStyle.opacity !== '0'
            && expandControl.getClientRects().length > 0
          )
        : false;

    const isClipped =
      message
        ? (
            message.scrollHeight
            > message.clientHeight + 1
          )
        : null;

    states.set(
      comment.id,
      {
        source: 'live-dom',
        hasExpandControl:
          Boolean(expandControl),
        expandControlText:
          expandControl?.textContent.trim()
          || null,
        expandControlVisible,
        isClipped,
        isCollapsed:
          message && expandControl
            ? Boolean(
                expandControlVisible
                && isClipped
              )
            : null,
        messageClientHeight:
          message?.clientHeight
          ?? null,
        messageScrollHeight:
          message?.scrollHeight
          ?? null,
        messageMaxHeight:
          messageStyle?.maxHeight
          ?? null,
        messageOverflow:
          messageStyle?.overflow
          ?? null,
        expandControlDisplay:
          expandStyle?.display
          ?? null,
        expandControlVisibility:
          expandStyle?.visibility
          ?? null
      }
    );
  }

  return states;
}

function extractFetchedCommentDisplayEvidence(
  comment
) {
  const content =
    comment.querySelector(
      ':scope > .content'
    );

  const message =
    content?.querySelector(
      ':scope > .message'
    )
    ?? null;

  const expandControl =
    message?.querySelector('.btn-more')
    ?? null;

  return {
    source: 'fetched-html',
    hasExpandControl:
      Boolean(expandControl),
    expandControlText:
      expandControl?.textContent.trim()
      || null,
    expandControlVisible: null,
    isClipped: null,
    isCollapsed: null,
    messageClassName:
      message?.className
      || null,
    messageStyleAttribute:
      message?.getAttribute('style')
      || null,
    expandControlClassName:
      expandControl?.className
      || null,
    expandControlStyleAttribute:
      expandControl?.getAttribute('style')
      || null
  };
}

function getCommentAuthor(comment) {
  const userInfo =
    comment?.querySelector('.user-info');

  const linkedAuthor =
    userInfo
      ?.querySelector('a')
      ?.textContent
      .trim();

  if (linkedAuthor) {
    return linkedAuthor;
  }

  return (
    userInfo?.textContent.trim()
    || null
  );
}

function getCommentContentParts(root) {
  if (!root) {
    return [];
  }

  const parts = [];
  let emoticonOccurrenceIndex = 0;
  let audioOccurrenceIndex = 0;

  walk(root);

  return parts;


  function walk(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (
          child.textContent
          && child.textContent.trim() !== ''
        ) {
          parts.push({
            type: 'text',
            text: child.textContent
          });
        }

        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        parts.push({
          type: 'unknown',
          tagName: child.nodeName,
          text: child.textContent,
          html: null
        });

        continue;
      }

      const element = child;

      // 댓글 내용이 아니라 사이트 UI인 요소는 contentParts에 넣지 않는다.
      // - .btn-more: "펼쳐보기▼" / 접기 같은 조작 버튼
      // - .modified: "*수정됨" 표시 (modified 필드로 이미 별도 보존)
      if (
        element.classList.contains('btn-more')
        || element.classList.contains('modified')
      ) {
        continue;
      }

      if (
        element.tagName === 'IMG'
        && element.classList.contains('twemoji')
      ) {
        parts.push({
          type: 'text',
          text: element.alt ?? '',
          source: 'twemoji'
        });

        continue;
      }

      if (element.tagName === 'BR') {
        parts.push({
          type: 'lineBreak'
        });

        continue;
      }

      if (
        element.classList.contains('emoticon')
        && (
          element.tagName === 'IMG'
          || element.tagName === 'VIDEO'
        )
      ) {
        parts.push({
          type: 'emoticon',
          occurrenceIndex:
            emoticonOccurrenceIndex
        });

        emoticonOccurrenceIndex++;
        continue;
      }

      if (element.tagName === 'AUDIO') {
        parts.push({
          type: 'audio',
          occurrenceIndex:
            audioOccurrenceIndex
        });

        audioOccurrenceIndex++;
        continue;
      }

      if (element.tagName === 'A') {
        parts.push({
          type: 'link',
          ...extractLinkInfo(
            element,
            extractReadableText(element)
          )
        });

        continue;
      }

      if (
        element.tagName === 'IMG'
        || element.tagName === 'VIDEO'
        || element.tagName === 'IFRAME'
      ) {
        parts.push({
          type: 'media',
          tagName: element.tagName,
          src:
            resolveUrl(
              element.getAttribute('src')
              || element.dataset.src
            ),
          className:
            element.className || null
        });

        continue;
      }

      walk(element);
    }
  }
}

function normalizeText(value) {
  return (value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function formatKoreaTime(timeElement) {
  const datetime =
    timeElement?.getAttribute('datetime');

  if (!datetime) {
    return (
      timeElement?.textContent.trim()
      || null
    );
  }

  const date = new Date(datetime);

  if (Number.isNaN(date.getTime())) {
    return (
      timeElement?.textContent.trim()
      || null
    );
  }

  return new Intl.DateTimeFormat(
    'sv-SE',
    {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }
  ).format(date);
}

function validateCommentRelations(comments) {
  const commentMap =
    new Map(
      comments
        .filter(comment => comment.commentId)
        .map(comment => [
          comment.commentId,
          comment
        ])
    );

  const issues = [];

  for (const comment of comments) {
    if (
      comment.parentCommentId !== null
      && !commentMap.has(
        comment.parentCommentId
      )
    ) {
      issues.push({
        code: 'PARENT_NOT_FOUND_IN_DATA',
        commentId: comment.commentId,
        parentCommentId:
          comment.parentCommentId
      });
    }

    if (
      comment.parentCommentId !== null
    ) {
      const parent =
        commentMap.get(
          comment.parentCommentId
        );

      if (
        parent
        && parent.replyDepth
          !== comment.replyDepth - 1
      ) {
        issues.push({
          code: 'PARENT_DEPTH_MISMATCH',
          commentId: comment.commentId,
          replyDepth: comment.replyDepth,
          parentCommentId:
            parent.commentId,
          parentReplyDepth:
            parent.replyDepth
        });
      }
    }

    if (
      comment.type === 'reply'
      && comment.parentCommentId
        !== comment.replyTargetId
    ) {
      issues.push({
        code: 'PARENT_TARGET_MISMATCH',
        commentId: comment.commentId,
        parentCommentId:
          comment.parentCommentId,
        replyTargetId:
          comment.replyTargetId
      });
    }

    if (
      comment.type === 'root'
      && comment.replyTargetId !== null
    ) {
      issues.push({
        code: 'ROOT_HAS_REPLY_TARGET',
        commentId: comment.commentId,
        replyTargetId:
          comment.replyTargetId
      });
    }
  }

  return issues;
}

function buildCommentSummary({
  detectedLastPage,
  displayedCommentCount,
  allComments,
  pageResults,
  relationAudit,
  commentCollectionDurationMs
}) {
  const commentIds =
    allComments
      .map(comment => comment.commentId)
      .filter(Boolean);

  const uniqueIds =
    new Set(commentIds);

  const seen = new Set();
  const duplicateIds = [];

  for (const id of commentIds) {
    if (seen.has(id)) {
      duplicateIds.push(id);
    }
    seen.add(id);
  }

  const replyDepthCounts = {};

  for (const comment of allComments) {
    const key = String(comment.replyDepth);
    replyDepthCounts[key] =
      (replyDepthCounts[key] ?? 0) + 1;
  }

  const emptyComments =
    allComments.filter(comment =>
      comment.text === null
      && comment.emoticons.length === 0
      && comment.audios.length === 0
      && comment.linkCard === null
    );

  const unknownContentParts =
    allComments.flatMap(comment =>
      comment.contentParts
        .filter(part => part.type === 'unknown')
        .map(part => ({
          commentId: comment.commentId,
          page: comment.page,
          part
        }))
    );

  const fetchErrors =
    pageResults
      .filter(result => !result.ok)
      .map(result => ({
        page: result.page,
        status: result.status,
        error: result.error ?? null
      }));

  return {
    status:
      fetchErrors.length === 0
        ? 'completed'
        : 'partial',
    detectedLastPage,
    displayedCommentCount,
    extractedCommentCount:
      allComments.length,
    commentCountMatches:
      displayedCommentCount === allComments.length,
    uniqueCommentIds:
      uniqueIds.size,
    duplicateCommentIds:
      [...new Set(duplicateIds)],
    missingCommentId:
      allComments.filter(
        comment => !comment.commentId
      ).length,
    missingAuthor:
      allComments.filter(
        comment => !comment.author
      ).length,
    missingCreatedAt:
      allComments.filter(
        comment => !comment.createdAt
      ).length,
    rootComments:
      allComments.filter(
        comment => comment.type === 'root'
      ).length,
    replyComments:
      allComments.filter(
        comment => comment.type === 'reply'
      ).length,
    replyDepthCounts,
    relationIssueCount:
      relationAudit.length,
    relationIssueExamples:
      relationAudit.slice(0, 20),
    modifiedComments:
      allComments.filter(
        comment => comment.modified
      ).length,
    deletedDomComments:
      allComments.filter(
        comment => comment.deleted
      ).length,
    textComments:
      allComments.filter(
        comment => comment.text !== null
      ).length,
    emoticonComments:
      allComments.filter(
        comment => comment.emoticons.length > 0
      ).length,
    totalEmoticons:
      allComments.reduce(
        (sum, comment) =>
          sum + comment.emoticons.length,
        0
      ),
    audioComments:
      allComments.filter(
        comment => comment.audios.length > 0
      ).length,
    totalAudioOccurrences:
      allComments.reduce(
        (sum, comment) =>
          sum + comment.audios.length,
        0
      ),
    totalAudioSourceVariants:
      allComments.reduce(
        (sum, comment) =>
          sum
          + comment.audios.reduce(
              (audioSum, audio) =>
                audioSum + audio.sources.length,
              0
            ),
        0
      ),
    commentsWithLinks:
      allComments.filter(
        comment => comment.links.length > 0
      ).length,
    linkCardComments:
      allComments.filter(
        comment => comment.linkCard !== null
      ).length,
    directTextComments:
      allComments.filter(
        comment => comment.textSource === 'direct'
      ).length,
    multilineComments:
      allComments.filter(
        comment => comment.text?.includes('\n')
      ).length,
    emptyComments:
      emptyComments.length,
    emptyCommentExamples:
      emptyComments.slice(0, 5),
    unknownContentParts:
      unknownContentParts.length,
    unknownContentPartExamples:
      unknownContentParts.slice(0, 10),
    commentsWithLiveDisplayState:
      allComments.filter(
        comment =>
          comment.displayState?.source === 'live-dom'
      ).length,
    liveCollapsedComments:
      allComments.filter(
        comment =>
          comment.displayState?.isCollapsed === true
      ).length,
    liveVisibleExpandControls:
      allComments.filter(
        comment =>
          comment.displayState?.expandControlVisible === true
      ).length,
    fetchErrors,
    commentCollectionDurationMs,
    totalCommentPageFetchDurationMs:
      pageResults.reduce(
        (sum, result) =>
          sum + result.durationMs,
        0
      )
  };
}


function discoverMediaResources({
  preview,
  body,
  comments
}) {
  const occurrences = [];

  function addOccurrence(
    url,
    source,
    role,
    metadata = {}
  ) {
    const resolved =
      resolveUrl(url);

    if (!resolved) {
      return;
    }

    occurrences.push({
      occurrenceIndex:
        occurrences.length,
      source,
      role,
      url: resolved,
      resourceKey:
        buildMediaResourceKey(
          resolved
        ),
      ...metadata
    });
  }

  addOccurrence(
    preview?.ogImage,
    'preview.ogImage',
    'preview'
  );

  addOccurrence(
    preview?.twitterImage,
    'preview.twitterImage',
    'preview'
  );

  for (
    let i = 0;
    i < (
      preview?.defaultImage
        ?.images
        ?.length
      ?? 0
    );
    i++
  ) {
    const image =
      preview.defaultImage
        .images[i];

    addOccurrence(
      image.currentSrc
        || image.src
        || image.dataSrc,
      `preview.defaultImage.images[${i}]`,
      'default-image',
      {
        defaultImageElementIndex:
          image.elementIndex
          ?? null,
        defaultImageImageIndex:
          image.imageIndex
          ?? null,
        relationToDefaultImage:
          image.relationToDefaultImage
          ?? null,
        display:
          image.display
          ?? null,
        visibility:
          image.visibility
          ?? null
      }
    );
  }

  for (
    let i = 0;
    i < (body?.sequence?.length ?? 0);
    i++
  ) {
    const item =
      body.sequence[i];

    const source =
      `body.sequence[${i}]`;

    if (item.type === 'image') {
      addOccurrence(
        item.currentSrc
          || item.src
          || item.dataSrc,
        source,
        'display-image'
      );

      addOccurrence(
        item.originalUrl,
        source,
        'original-image'
      );
    }

    if (item.type === 'video') {
      addOccurrence(
        item.currentSrc
          || item.src
          || item.dataSrc,
        source,
        'display-video'
      );

      addOccurrence(
        item.originalUrl,
        source,
        item.dataOrig === 'gif'
          ? 'original-gif'
          : 'original-video'
      );

      addOccurrence(
        item.poster,
        source,
        'video-poster'
      );
    }

    if (item.type === 'audio') {
      addOccurrence(
        item.currentSrc
          || item.src,
        source,
        'body-audio'
      );

      for (
        let sourceIndex = 0;
        sourceIndex
          < (item.sources?.length ?? 0);
        sourceIndex++
      ) {
        addOccurrence(
          item.sources[sourceIndex].src,
          `${source}.sources[${sourceIndex}]`,
          'body-audio-source',
          {
            htmlType:
              item.sources[sourceIndex]
                .htmlType
              ?? null
          }
        );
      }
    }
  }

  for (
    let commentIndex = 0;
    commentIndex
      < (comments?.items?.length ?? 0);
    commentIndex++
  ) {
    const comment =
      comments.items[commentIndex];

    for (
      let emoticonIndex = 0;
      emoticonIndex
        < (comment.emoticons?.length ?? 0);
      emoticonIndex++
    ) {
      const emoticon =
        comment.emoticons[
          emoticonIndex
        ];

      const source =
        `comments.items[${commentIndex}].emoticons[${emoticonIndex}]`;

      addOccurrence(
        emoticon.src
          || emoticon.dataSrc,
        source,
        'comment-emoticon'
      );

      addOccurrence(
        emoticon.poster,
        source,
        'comment-emoticon-poster'
      );
    }

    for (
      let audioIndex = 0;
      audioIndex
        < (comment.audios?.length ?? 0);
      audioIndex++
    ) {
      const audio =
        comment.audios[audioIndex];

      const source =
        `comments.items[${commentIndex}].audios[${audioIndex}]`;

      addOccurrence(
        audio.currentSrc
          || audio.src,
        source,
        'comment-audio'
      );

      for (
        let sourceIndex = 0;
        sourceIndex
          < (audio.sources?.length ?? 0);
        sourceIndex++
      ) {
        const audioSource =
          audio.sources[sourceIndex];

        addOccurrence(
          audioSource.src,
          `${source}.sources[${sourceIndex}]`,
          'comment-audio-source',
          {
            htmlType:
              audioSource.htmlType
              ?? null,
            stemCandidate:
              audioSource.stemCandidate
              ?? null
          }
        );
      }
    }
  }

  const resourceMap =
    new Map();

  for (const occurrence of occurrences) {
    const key =
      occurrence.resourceKey
      || occurrence.url;

    if (!resourceMap.has(key)) {
      const parsed =
        parseUrlSafe(
          occurrence.url
        );

      resourceMap.set(
        key,
        {
          resourceIndex:
            resourceMap.size,
          resourceKey: key,
          representativeUrl:
            occurrence.url,
          urlCandidates: [],
          host:
            parsed?.hostname ?? null,
          pathname:
            parsed?.pathname ?? null,
          fetchEligible:
            isSupportedMediaFetchUrl(
              occurrence.url
            ),
          roles: [],
          occurrences: []
        }
      );
    }

    const resource =
      resourceMap.get(key);

    if (
      !resource.urlCandidates.includes(
        occurrence.url
      )
    ) {
      resource.urlCandidates.push(
        occurrence.url
      );
    }

    if (
      !resource.roles.includes(
        occurrence.role
      )
    ) {
      resource.roles.push(
        occurrence.role
      );
    }

    resource.occurrences.push({
      occurrenceIndex:
        occurrence.occurrenceIndex,
      source:
        occurrence.source,
      role:
        occurrence.role,
      htmlType:
        occurrence.htmlType
        ?? null,
      stemCandidate:
        occurrence.stemCandidate
        ?? null
    });
  }

  const resources =
    Array.from(
      resourceMap.values()
    );

  return {
    occurrenceCount:
      occurrences.length,
    uniqueResourceCount:
      resources.length,
    fetchEligibleCount:
      resources.filter(
        resource =>
          resource.fetchEligible
      ).length,
    unsupportedResourceCount:
      resources.filter(
        resource =>
          !resource.fetchEligible
      ).length,
    occurrences,
    resources
  };
}


function buildMediaResourceKey(url) {
  const parsed =
    parseUrlSafe(url);

  if (!parsed) {
    return url;
  }

  const type =
    parsed.searchParams.get('type');

  return (
    parsed.origin
    + parsed.pathname
    + (
      type
        ? `?type=${encodeURIComponent(type)}`
        : ''
    )
  );
}


function parseUrlSafe(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  }
  catch {
    return null;
  }
}


function isSupportedMediaFetchUrl(value) {
  const parsed =
    parseUrlSafe(value);

  if (!parsed) {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  return [
    'arca.live',
    'ac.arca.live',
    'ac-o.arca.live'
  ].includes(
    parsed.hostname
  );
}


async function fetchDiscoveredMedia(
  discovery
) {
  const MAX_BYTES =
    25 * 1024 * 1024;

  const BODY_TIMEOUT_MS = 15000;
  const METADATA_TIMEOUT_MS = 5000;

  const BODY_BATCH_SIZE = 80;
  const ORIGINAL_METADATA_BATCH_SIZE = 25;

  const BODY_CONCURRENCY = 4;
  const ORIGINAL_METADATA_CONCURRENCY = 1;

  const BODY_RETRY_429_COUNT = 2;
  const ORIGINAL_METADATA_RETRY_429_COUNT = 1;

  const BODY_RETRY_BASE_DELAY_MS = 750;
  const ORIGINAL_METADATA_RETRY_BASE_DELAY_MS =
    1000;

  const ORIGINAL_METADATA_INTER_BATCH_DELAY_MS =
    500;

  const BODY_TRANSFER_MAX_BYTES_PER_RESOURCE =
    16 * 1024 * 1024;

  const BODY_TRANSFER_MAX_TOTAL_BYTES_PER_BATCH =
    32 * 1024 * 1024;


  const eligible =
    discovery.resources.filter(
      resource =>
        resource.fetchEligible
    );


  const bodyEligible = [];
  const originalMetadataEligible = [];
  const originalImageMetadataDeferred = [];

  for (
    const resource
    of eligible
  ) {
    const parsed =
      parseUrlSafe(
        resource.representativeUrl
      );

    if (
      parsed?.hostname
      === 'ac-o.arca.live'
    ) {
      const roles =
        resource.roles ?? [];

      if (
        roles.includes('original-image')
      ) {
        originalImageMetadataDeferred.push(
          resource
        );
      }
      else {
        originalMetadataEligible.push(
          resource
        );
      }
    }
    else {
      bodyEligible.push(
        resource
      );
    }
  }


  const bodyRequests =
    bodyEligible.map(
      resource => ({
        resourceIndex:
          resource.resourceIndex,
        resourceKey:
          resource.resourceKey,
        url:
          resource.representativeUrl,
        fetchMode: 'body'
      })
    );

  const originalMetadataRequests =
    originalMetadataEligible.map(
      resource => ({
        resourceIndex:
          resource.resourceIndex,
        resourceKey:
          resource.resourceKey,
        url:
          resource.representativeUrl,
        fetchMode: 'metadata'
      })
    );


  function splitIntoBatches(
    items,
    batchSize
  ) {
    const batches = [];

    for (
      let offset = 0;
      offset < items.length;
      offset += batchSize
    ) {
      batches.push(
        items.slice(
          offset,
          offset + batchSize
        )
      );
    }

    return batches;
  }


  const bodyBatches =
    splitIntoBatches(
      bodyRequests,
      BODY_BATCH_SIZE
    );

  const originalMetadataBatches =
    splitIntoBatches(
      originalMetadataRequests,
      ORIGINAL_METADATA_BATCH_SIZE
    );



  const results = [];

  const bodyTransferBase64ByResourceIndex =
    new Map();

  const batchSummaries = [];


  function consumeRawResults(
    rawResults,
    batchKind,
    batchNumber
  ) {
    const safeResults = [];

    for (
      const result
      of rawResults
    ) {
      if (
        result?.bodyTransferAvailable
        && typeof result.bodyBase64
          === 'string'
      ) {
        bodyTransferBase64ByResourceIndex
          .set(
            result.resourceIndex,
            {
              base64:
                result.bodyBase64,
              mimeType:
                result.blobType
                || result.responseContentType
                || 'application/octet-stream',
              finalUrl:
                result.finalUrl
                ?? null,
              byteLength:
                result.bodyTransferByteLength
                ?? result.blobSize
                ?? null,
              base64Length:
                result.bodyTransferBase64Length
                ?? result.bodyBase64.length,
              source:
                'priority-batched-initial-media-fetch'
            }
          );
      }

      const {
        bodyBase64,
        ...safeResult
      } = result;

      safeResults.push(
        safeResult
      );

      results.push(
        safeResult
      );
    }

    batchSummaries.push({
      kind:
        batchKind,
      batchNumber,
      completedCount:
        safeResults.length,
      successCount:
        safeResults.filter(
          result =>
            result.ok === true
        ).length,
      failureCount:
        safeResults.filter(
          result =>
            result.ok !== true
        ).length,
      rateLimitedCount:
        safeResults.filter(
          result =>
            result.rateLimitEncountered
              === true
        ).length,
      retryCount:
        safeResults.reduce(
          (sum, result) =>
            sum
            + Math.max(
                0,
                (result.attempts || 1) - 1
              ),
          0
        )
    });

    return safeResults;
  }


  async function runBatch({
    batch,
    batchKind,
    batchNumber,
    bodyConcurrency,
    metadataConcurrency,
    retry429Count,
    retryBaseDelayMs,
    returnBodyBase64MaxBytes,
    returnBodyBase64MaxTotalBytes
  }) {
    const startedAt =
      performance.now();

    try {
      const response =
        await chrome.runtime.sendMessage({
          type:
            'AI_AI_FETCH_MEDIA_BATCH',

          bodyConcurrency,
          metadataConcurrency,

          maxBytesPerResource:
            MAX_BYTES,

          bodyTimeoutMs:
            BODY_TIMEOUT_MS,

          metadataTimeoutMs:
            METADATA_TIMEOUT_MS,

          retry429Count,
          retryBaseDelayMs,

          returnBodyBase64MaxBytes,
          returnBodyBase64MaxTotalBytes,

          resources:
            batch
        });

      if (!response?.success) {
        throw new Error(
          response?.error
          || 'Service Worker media batch failed'
        );
      }

      const safeResults =
        consumeRawResults(
          response.results ?? [],
          batchKind,
          batchNumber
        );

      const summary =
        batchSummaries[
          batchSummaries.length - 1
        ];

      summary.requestedCount =
        batch.length;

      summary.durationMs =
        Math.round(
          performance.now()
          - startedAt
        );

    }
    catch (error) {
      const failureResults =
        batch.map(
          resource => ({
            resourceIndex:
              resource.resourceIndex
              ?? null,
            resourceKey:
              resource.resourceKey
              ?? null,
            requestedUrl:
              resource.url
              ?? null,
            fetchMode:
              resource.fetchMode
              ?? null,
            attempts: 0,
            rateLimitEncountered:
              false,
            retryWaitMsTotal: 0,
            ok: false,
            metadataFetched:
              false,
            bodyFetched:
              false,
            status: null,
            statusText: null,
            redirected: false,
            finalUrl: null,
            responseContentType:
              null,
            responseContentLength:
              null,
            blobType: null,
            blobSize: null,
            bodyTransferAvailable:
              false,
            bodyTransferEncoding:
              null,
            bodyTransferByteLength:
              null,
            bodyTransferBase64Length:
              null,
            bodyTransferSkipReason:
              null,
            skipReason:
              'batch-message-failed',
            durationMs: null,
            error:
              String(error)
          })
        );

      for (
        const result
        of failureResults
      ) {
        results.push(result);
      }

      batchSummaries.push({
        kind:
          batchKind,
        batchNumber,
        requestedCount:
          batch.length,
        completedCount:
          failureResults.length,
        successCount: 0,
        failureCount:
          failureResults.length,
        rateLimitedCount: 0,
        retryCount: 0,
        durationMs:
          Math.round(
            performance.now()
            - startedAt
          ),
        batchMessageFailed:
          true,
        error:
          String(error)
      });

      console.error(
        '[AI_AI] media batch 자체 실패',
        {
          kind:
            batchKind,
          batchNumber,
          error:
            String(error)
        }
      );
    }
  }


  /*
   * 1단계:
   * 표시용/댓글 등 실제 body가 필요한 리소스를
   * 원본 metadata보다 먼저 끝까지 처리한다.
   */
  for (
    let index = 0;
    index < bodyBatches.length;
    index++
  ) {
    await runBatch({
      batch:
        bodyBatches[index],
      batchKind:
        'body-priority',
      batchNumber:
        index + 1,
      bodyConcurrency:
        BODY_CONCURRENCY,
      metadataConcurrency: 1,
      retry429Count:
        BODY_RETRY_429_COUNT,
      retryBaseDelayMs:
        BODY_RETRY_BASE_DELAY_MS,
      returnBodyBase64MaxBytes:
        BODY_TRANSFER_MAX_BYTES_PER_RESOURCE,
      returnBodyBase64MaxTotalBytes:
        BODY_TRANSFER_MAX_TOTAL_BYTES_PER_BATCH
    });
  }


  /*
   * 2단계:
   * ac-o 원본 metadata는 body 수집이 끝난 뒤,
   * 낮은 동시성과 작은 batch로 천천히 처리한다.
   */
  for (
    let index = 0;
    index
      < originalMetadataBatches.length;
    index++
  ) {
    await runBatch({
      batch:
        originalMetadataBatches[index],
      batchKind:
        'original-metadata',
      batchNumber:
        index + 1,
      bodyConcurrency: 1,
      metadataConcurrency:
        ORIGINAL_METADATA_CONCURRENCY,
      retry429Count:
        ORIGINAL_METADATA_RETRY_429_COUNT,
      retryBaseDelayMs:
        ORIGINAL_METADATA_RETRY_BASE_DELAY_MS,
      returnBodyBase64MaxBytes: 0,
      returnBodyBase64MaxTotalBytes: 0
    });

    if (
      index
      < originalMetadataBatches.length - 1
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            ORIGINAL_METADATA_INTER_BATCH_DELAY_MS
          )
      );
    }
  }


  results.sort(
    (a, b) =>
      (a.resourceIndex ?? 0)
      - (b.resourceIndex ?? 0)
  );


  const bodyFetched =
    results.filter(
      result =>
        result.bodyFetched === true
    );

  const metadataOnly =
    results.filter(
      result =>
        result.ok === true
        && result.bodyFetched !== true
        && result.skipReason
          === 'metadata-only-original'
    );

  const actualBodySkipped =
    results.filter(
      result =>
        result.bodyFetched !== true
        && result.skipReason
          !== 'metadata-only-original'
    );


  const comparisons =
    buildDisplayOriginalComparisons(
      discovery,
      results
    );


  const fetchSummary = {
    status: 'completed',

    requestedResources:
      bodyRequests.length
      + originalMetadataRequests.length,

    completedResources:
      results.length,

    bodyRequestedResources:
      bodyRequests.length,

    originalMetadataRequestedResources:
      originalMetadataRequests.length,

    originalImageMetadataDeferredToRangeProbe:
      originalImageMetadataDeferred.length,

    bodyBatchSize:
      BODY_BATCH_SIZE,

    originalMetadataBatchSize:
      ORIGINAL_METADATA_BATCH_SIZE,

    bodyBatchCount:
      bodyBatches.length,

    originalMetadataBatchCount:
      originalMetadataBatches.length,

    bodyPriorityCompletedBeforeOriginalMetadata:
      true,

    originalMetadataConcurrency:
      ORIGINAL_METADATA_CONCURRENCY,

    originalMetadataInterBatchDelayMs:
      ORIGINAL_METADATA_INTER_BATCH_DELAY_MS,

    successCount:
      results.filter(
        result =>
          result.ok === true
      ).length,

    failureCount:
      results.filter(
        result =>
          result.ok !== true
      ).length,

    bodyRequestFailureCount:
      results.filter(
        result =>
          result.fetchMode === 'body'
          && result.ok !== true
      ).length,

    originalMetadataFailureCount:
      results.filter(
        result =>
          result.fetchMode === 'metadata'
          && result.ok !== true
      ).length,

    metadataSuccessCount:
      results.filter(
        result =>
          result.metadataFetched === true
      ).length,

    bodyFetchedCount:
      bodyFetched.length,

    metadataOnlyCount:
      metadataOnly.length,

    bodySkippedCount:
      actualBodySkipped.length,

    totalFetchedBytes:
      bodyFetched.reduce(
        (sum, result) =>
          sum
          + (
              result.blobSize
              || 0
            ),
        0
      ),

    rateLimitedCount:
      results.filter(
        result =>
          result.rateLimitEncountered
            === true
      ).length,

    bodyRateLimitedCount:
      results.filter(
        result =>
          result.fetchMode === 'body'
          && result.rateLimitEncountered
            === true
      ).length,

    originalMetadataRateLimitedCount:
      results.filter(
        result =>
          result.fetchMode === 'metadata'
          && result.rateLimitEncountered
            === true
      ).length,

    timedOutCount:
      results.filter(
        result =>
          result.skipReason
            === 'timeout'
      ).length,

    retryCount:
      results.reduce(
        (sum, result) =>
          sum
          + Math.max(
              0,
              (result.attempts || 1) - 1
            ),
        0
      ),

    bodyTransferAvailableCount:
      bodyTransferBase64ByResourceIndex.size,

    bodyTransferBytes:
      results.reduce(
        (sum, result) =>
          sum
          + (
              result.bodyTransferByteLength
              || 0
            ),
        0
      ),

    batchSummaries,

    displayOriginalComparisons:
      comparisons,

    results
  };


  Object.defineProperty(
    fetchSummary,
    '_bodyTransferBase64ByResourceIndex',
    {
      value:
        bodyTransferBase64ByResourceIndex,
      enumerable: false,
      configurable: false,
      writable: false
    }
  );



  return fetchSummary;
}


function buildDisplayOriginalComparisons(
  discovery,
  results
) {
  const resultByIndex =
    new Map(
      results.map(
        result => [
          result.resourceIndex,
          result
        ]
      )
    );

  const displayByHashAndKind =
    new Map();

  for (
    const resource
    of discovery.resources
  ) {
    const hash =
      extractAssetHashCandidate(
        resource.representativeUrl
      );

    if (!hash) {
      continue;
    }

    const roles =
      resource.roles ?? [];

    let kind = null;

    if (
      roles.includes('display-image')
    ) {
      kind = 'image';
    }
    else if (
      roles.includes('display-video')
    ) {
      kind = 'video';
    }

    if (!kind) {
      continue;
    }

    displayByHashAndKind.set(
      `${hash}:${kind}`,
      resource
    );
  }

  const comparisons = [];

  for (
    const original
    of discovery.resources
  ) {
    const roles =
      original.roles ?? [];

    let kind = null;

    if (
      roles.includes('original-image')
    ) {
      kind = 'image';
    }
    else if (
      roles.includes('original-video')
    ) {
      kind = 'video';
    }

    if (!kind) {
      continue;
    }

    const hash =
      extractAssetHashCandidate(
        original.representativeUrl
      );

    if (!hash) {
      continue;
    }

    const display =
      displayByHashAndKind.get(
        `${hash}:${kind}`
      );

    if (!display) {
      continue;
    }

    const displayResult =
      resultByIndex.get(
        display.resourceIndex
      ) ?? null;

    const originalResult =
      resultByIndex.get(
        original.resourceIndex
      ) ?? null;

    const displayType =
      displayResult
        ?.responseContentType
      ?? displayResult?.blobType
      ?? null;

    const originalType =
      originalResult
        ?.responseContentType
      ?? originalResult?.blobType
      ?? null;

    const displayLength =
      displayResult
        ?.responseContentLength
      ?? displayResult?.blobSize
      ?? null;

    const originalLength =
      originalResult
        ?.responseContentLength
      ?? originalResult?.blobSize
      ?? null;

    const comparable =
      displayType !== null
      && originalType !== null
      && displayLength !== null
      && originalLength !== null;

    const sameContentType =
      displayType !== null
      && originalType !== null
        ? displayType
          === originalType
        : null;

    const sameContentLength =
      displayLength !== null
      && originalLength !== null
        ? displayLength
          === originalLength
        : null;

    comparisons.push({
      assetHashCandidate: hash,
      kind,
      displayResourceIndex:
        display.resourceIndex,
      originalResourceIndex:
        original.resourceIndex,
      displayContentType:
        displayType,
      originalContentType:
        originalType,
      displayContentLength:
        displayLength,
      originalContentLength:
        originalLength,
      sameContentType,
      sameContentLength,
      metadataEquivalentCandidate:
        comparable
          ? sameContentType
            && sameContentLength
          : null,
      metadataDifferent:
        comparable
          ? !(
              sameContentType
              && sameContentLength
            )
          : null,
      displayBodyFetched:
        displayResult
          ?.bodyFetched
        ?? false,
      originalBodyFetched:
        originalResult
          ?.bodyFetched
        ?? false,
      originalFetchMode:
        originalResult
          ?.fetchMode
        ?? null
    });
  }

  return comparisons;
}


function extractAssetHashCandidate(value) {
  const parsed =
    parseUrlSafe(value);

  if (!parsed) {
    return null;
  }

  const match =
    parsed.pathname.match(
      /[0-9a-f]{64}/i
    );

  return match
    ? match[0].toLowerCase()
    : null;
}




async function probeOriginalImageDimensions({
  mediaDiscovery,
  mediaFetch,
  warnings
}) {
  // 0.3.24 성능 수정:
  // ac-o 원본 Range probe가 실패할 때 10초 timeout + 다중 재시도로
  // 전체 추출이 1분 이상 지연되는 사례가 있었다.
  //
  // 따라서 의미 기반 선별은 하지 않되, probe 자체에 기술 시간 예산을 둔다.
  // - 한 요청 최대 2.5초
  // - 한 batch는 최대 2개를 동시에 시도
  // - 전체 probe는 약 8초 예산
  // - HTTP 429만 1회, 8초 예산 안에서 순차 재시도
  // - timeout/5xx 등은 재시도하지 않고 관찰값으로 남김
  //
  // 성공한 원본 관찰은 기존 원본 선택 로직에서 그대로 사용한다.
  // 실패/시간예산 초과 원본도 URL과 관계 자체는 discovery에 그대로 남는다.
  const BATCH_SIZE = 2;
  const CONCURRENCY = 2;
  const INTER_BATCH_DELAY_MS = 150;
  const PROBE_TIMEOUT_MS = 2500;
  const PROBE_TOTAL_BUDGET_MS = 8000;
  const PREFIX_BYTES = 64 * 1024;
  const MIN_RETRY_REQUEST_BUDGET_MS =
    1000;
  const RETRY_TIME_RESERVE_MS = 100;

  const RETRY_ROUNDS = [
    {
      round: 1,
      startDelayMs: 500,
      batchSize: 1,
      concurrency: 1,
      interBatchDelayMs: 250
    }
  ];

  const probeStartedAt =
    performance.now();

  function remainingProbeBudgetMs() {
    return Math.max(
      0,
      PROBE_TOTAL_BUDGET_MS
      - (
          performance.now()
          - probeStartedAt
        )
    );
  }

  const resourceByIndex =
    new Map(
      (mediaDiscovery?.resources ?? [])
        .map(resource => [
          resource.resourceIndex,
          resource
        ])
    );

  const resultByIndex =
    new Map(
      (mediaFetch?.results ?? [])
        .map(result => [
          result.resourceIndex,
          result
        ])
    );

  const pairs =
    Array.isArray(
      mediaFetch
        ?.displayOriginalComparisons
    )
      ? mediaFetch
          .displayOriginalComparisons
      : [];

  const candidates =
    pairs
      .filter(
        pair =>
          pair.kind === 'image'
      )
      .map(pair => {
        const displayResult =
          resultByIndex.get(
            pair.displayResourceIndex
          ) ?? null;

        const originalResult =
          resultByIndex.get(
            pair.originalResourceIndex
          ) ?? null;

        const originalResource =
          resourceByIndex.get(
            pair.originalResourceIndex
          ) ?? null;

        const displayLength =
          displayResult?.ok === true
          && Number.isFinite(
            displayResult
              ?.responseContentLength
          )
            ? displayResult
                .responseContentLength
            : displayResult?.ok === true
              && Number.isFinite(
                displayResult?.blobSize
              )
              ? displayResult.blobSize
              : null;

        const originalMetadataDeferred =
          originalResult === null
          && (
            originalResource
              ?.roles
              ?.includes('original-image')
            ?? false
          );

        const originalMetadataOk =
          originalResult?.ok === true;

        const originalLength =
          originalMetadataOk
          && Number.isFinite(
            originalResult
              ?.responseContentLength
          )
            ? originalResult
                .responseContentLength
            : null;

        const metadataByteRatio =
          Number.isFinite(displayLength)
          && displayLength > 0
          && Number.isFinite(originalLength)
            ? originalLength
              / displayLength
            : null;

        return {
          displayResourceIndex:
            pair.displayResourceIndex,
          originalResourceIndex:
            pair.originalResourceIndex,
          assetHashCandidate:
            pair.assetHashCandidate
            ?? null,
          originalUrl:
            originalResource
              ?.representativeUrl
            ?? originalResult
              ?.requestedUrl
            ?? null,
          displayContentLength:
            displayLength,
          originalContentLength:
            originalLength,
          originalMetadataOk,
          originalMetadataDeferred,
          originalMetadataStatus:
            originalResult?.status
            ?? null,
          originalMetadataResponseContentLength:
            Number.isFinite(
              originalResult
                ?.responseContentLength
            )
              ? originalResult
                  .responseContentLength
              : null,
          metadataByteRatio
        };
      })
      .filter(
        candidate =>
          Boolean(candidate.originalUrl)
      )
      .sort(
        (a, b) =>
          a.originalResourceIndex
          - b.originalResourceIndex
      )
      .map(
        (candidate, sampleIndex) => ({
          ...candidate,
          sampleIndex
        })
      );

  if (candidates.length === 0) {
    return {
      status:
        'skipped',
      selectionStrategy:
        'all-image-candidates-budgeted-batched-range-prefix-limited-429-retry',
      candidateCount: 0,
      selectedCount: 0,
      completedCount: 0,
      batchSize:
        BATCH_SIZE,
      batchCount: 0,
      concurrency:
        CONCURRENCY,
      interBatchDelayMs:
        INTER_BATCH_DELAY_MS,
      rangeHonoredCount: 0,
      rangeNotHonoredCount: 0,
      dimensionSuccessCount: 0,
      failureCount: 0,
      timedOutCount: 0,
      rateLimitedCount: 0,
      bytesReadTotal: 0,
      prefixBytesRequested:
        PREFIX_BYTES,
      durationMs: 0,
      parserCounts: {},
      httpStatusCounts: {},
      batchSummaries: [],
      requestTimeoutMs:
        PROBE_TIMEOUT_MS,
      totalTimeBudgetMs:
        PROBE_TOTAL_BUDGET_MS,
      timeBudgetExceeded: false,
      budgetSkippedCount: 0,
      attemptedCount: 0,
      retryEnabled: true,
      retryRoundCount:
        RETRY_ROUNDS.length,
      results: [],
      interpretationApplied:
        false,
      automaticInclusionDecisionApplied:
        false
    };
  }

  const batches = [];

  for (
    let offset = 0;
    offset < candidates.length;
    offset += BATCH_SIZE
  ) {
    batches.push(
      candidates.slice(
        offset,
        offset + BATCH_SIZE
      )
    );
  }

  const probeResults = [];
  const batchSummaries = [];
  let probeBudgetExceeded = false;

  function makeBudgetSkippedResult(candidate) {
    return {
      sampleIndex:
        candidate.sampleIndex,
      displayResourceIndex:
        candidate.displayResourceIndex,
      originalResourceIndex:
        candidate.originalResourceIndex,
      assetHashCandidate:
        candidate.assetHashCandidate,
      displayContentLength:
        candidate.displayContentLength,
      originalContentLength:
        candidate.originalContentLength,
      originalMetadataOk:
        candidate.originalMetadataOk
        ?? false,
      originalMetadataDeferred:
        candidate.originalMetadataDeferred
        ?? false,
      originalMetadataStatus:
        candidate.originalMetadataStatus
        ?? null,
      originalMetadataResponseContentLength:
        candidate.originalMetadataResponseContentLength
        ?? null,
      metadataByteRatio:
        candidate.metadataByteRatio
        ?? null,
      rangeReportedTotalBytes: null,
      ok: false,
      status: null,
      contentType: null,
      contentRange: null,
      rangeHonored: false,
      bytesRead: 0,
      dimensionStatus: 'not-probed',
      width: null,
      height: null,
      pixelCount: null,
      parser: null,
      skipReason:
        'probe-time-budget-exceeded',
      durationMs: 0,
      error: null
    };
  }

  for (
    let batchIndex = 0;
    batchIndex < batches.length;
    batchIndex++
  ) {
    const elapsedBeforeBatch =
      performance.now()
      - probeStartedAt;

    const remainingBudgetMs =
      remainingProbeBudgetMs();

    // 다음 batch의 단일 요청 timeout조차 수용할 시간이 없으면
    // 새 네트워크 요청을 시작하지 않고 나머지를 기술적 미관찰로 기록한다.
    if (
      batchIndex > 0
      && remainingBudgetMs
        < PROBE_TIMEOUT_MS
    ) {
      const remainingCandidates =
        batches
          .slice(batchIndex)
          .flat();

      probeResults.push(
        ...remainingCandidates.map(
          makeBudgetSkippedResult
        )
      );

      batchSummaries.push({
        batchNumber:
          batchIndex + 1,
        requestedCount: 0,
        completedCount:
          remainingCandidates.length,
        dimensionSuccessCount: 0,
        rangeHonoredCount: 0,
        failureCount:
          remainingCandidates.length,
        bytesRead: 0,
        durationMs: 0,
        batchMessageFailed: false,
        skipped:
          'probe-time-budget-exceeded',
        remainingBudgetMs:
          Math.max(
            0,
            Math.round(
              remainingBudgetMs
            )
          )
      });

      warnings.push({
        stage:
          'original-dimension-probe',
        code:
          'ORIGINAL_DIMENSION_PROBE_TIME_BUDGET_EXCEEDED',
        skippedCount:
          remainingCandidates.length,
        timeBudgetMs:
          PROBE_TOTAL_BUDGET_MS,
        elapsedMs:
          Math.round(
            elapsedBeforeBatch
          )
      });

      probeBudgetExceeded = true;
      break;
    }

    const batch =
      batches[batchIndex];

    const batchStartedAt =
      performance.now();

    try {
      const response =
        await chrome.runtime.sendMessage({
          type:
            'AI_AI_PROBE_IMAGE_DIMENSIONS_BATCH',
          concurrency:
            CONCURRENCY,
          timeoutMs:
            PROBE_TIMEOUT_MS,
          prefixBytes:
            PREFIX_BYTES,
          resources:
            batch.map(
              candidate => ({
                sampleIndex:
                  candidate.sampleIndex,
                displayResourceIndex:
                  candidate
                    .displayResourceIndex,
                originalResourceIndex:
                  candidate
                    .originalResourceIndex,
                assetHashCandidate:
                  candidate
                    .assetHashCandidate,
                url:
                  candidate.originalUrl
              })
            )
        });

      if (!response?.success) {
        throw new Error(
          response?.error
          || 'original dimension range probe batch failed'
        );
      }

      const candidateBySampleIndex =
        new Map(
          batch.map(
            candidate => [
              candidate.sampleIndex,
              candidate
            ]
          )
        );

      const batchResults =
        (response.results ?? [])
          .map(result => {
            const candidate =
              candidateBySampleIndex.get(
                result.sampleIndex
              ) ?? null;

            return {
              sampleIndex:
                result.sampleIndex
                ?? candidate?.sampleIndex
                ?? null,
              displayResourceIndex:
                result.displayResourceIndex
                ?? candidate
                  ?.displayResourceIndex
                ?? null,
              originalResourceIndex:
                result.originalResourceIndex
                ?? candidate
                  ?.originalResourceIndex
                ?? null,
              assetHashCandidate:
                result.assetHashCandidate
                ?? candidate
                  ?.assetHashCandidate
                ?? null,
              displayContentLength:
                candidate
                  ?.displayContentLength
                ?? null,
              originalContentLength:
                candidate
                  ?.originalContentLength
                ?? null,
              originalMetadataOk:
                candidate
                  ?.originalMetadataOk
                ?? false,
              originalMetadataDeferred:
                candidate
                  ?.originalMetadataDeferred
                ?? false,
              originalMetadataStatus:
                candidate
                  ?.originalMetadataStatus
                ?? null,
              originalMetadataResponseContentLength:
                candidate
                  ?.originalMetadataResponseContentLength
                ?? null,
              metadataByteRatio:
                candidate
                  ?.metadataByteRatio
                ?? null,
              rangeReportedTotalBytes:
                result
                  .totalBytesFromContentRange
                ?? null,
              ok:
                result.ok
                ?? false,
              status:
                result.status
                ?? null,
              contentType:
                result.contentType
                ?? null,
              contentRange:
                result.contentRange
                ?? null,
              rangeHonored:
                result.rangeHonored
                ?? false,
              bytesRead:
                result.bytesRead
                ?? 0,
              dimensionStatus:
                result.dimensionStatus
                ?? 'unknown',
              width:
                result.width
                ?? null,
              height:
                result.height
                ?? null,
              pixelCount:
                result.pixelCount
                ?? null,
              parser:
                result.parser
                ?? null,
              skipReason:
                result.skipReason
                ?? null,
              durationMs:
                result.durationMs
                ?? null,
              error:
                result.error
                ?? null
            };
          });

      const returnedSampleIndexes =
        new Set(
          batchResults
            .map(
              result =>
                result.sampleIndex
            )
            .filter(
              Number.isInteger
            )
        );

      for (const candidate of batch) {
        if (
          !returnedSampleIndexes.has(
            candidate.sampleIndex
          )
        ) {
          batchResults.push({
            sampleIndex:
              candidate.sampleIndex,
            displayResourceIndex:
              candidate
                .displayResourceIndex,
            originalResourceIndex:
              candidate
                .originalResourceIndex,
            assetHashCandidate:
              candidate
                .assetHashCandidate,
            displayContentLength:
              candidate
                .displayContentLength,
            originalContentLength:
              candidate
                .originalContentLength,
            originalMetadataOk:
              candidate
                .originalMetadataOk
              ?? false,
            originalMetadataDeferred:
              candidate
                .originalMetadataDeferred
              ?? false,
            originalMetadataStatus:
              candidate
                .originalMetadataStatus
              ?? null,
            originalMetadataResponseContentLength:
              candidate
                .originalMetadataResponseContentLength
              ?? null,
            metadataByteRatio:
              candidate
                .metadataByteRatio,
            rangeReportedTotalBytes:
              null,
            ok: false,
            status: null,
            contentType: null,
            contentRange: null,
            rangeHonored: false,
            bytesRead: 0,
            dimensionStatus:
              'failed',
            width: null,
            height: null,
            pixelCount: null,
            parser: null,
            skipReason:
              'missing-batch-result',
            durationMs: null,
            error:
              'Service Worker batch result missing'
          });
        }
      }

      probeResults.push(
        ...batchResults
      );

      batchSummaries.push({
        batchNumber:
          batchIndex + 1,
        requestedCount:
          batch.length,
        completedCount:
          batchResults.length,
        dimensionSuccessCount:
          batchResults.filter(
            result =>
              result.dimensionStatus
              === 'success'
          ).length,
        rangeHonoredCount:
          batchResults.filter(
            result =>
              result.rangeHonored
              === true
          ).length,
        failureCount:
          batchResults.filter(
            result =>
              result.dimensionStatus
              !== 'success'
          ).length,
        bytesRead:
          batchResults.reduce(
            (sum, result) =>
              sum
              + (
                  Number.isFinite(
                    result.bytesRead
                  )
                    ? result.bytesRead
                    : 0
                ),
            0
          ),
        durationMs:
          Math.round(
            performance.now()
            - batchStartedAt
          ),
        batchMessageFailed:
          false
      });
    }
    catch (error) {
      const message =
        String(error);

      const failures =
        batch.map(
          candidate => ({
            sampleIndex:
              candidate.sampleIndex,
            displayResourceIndex:
              candidate
                .displayResourceIndex,
            originalResourceIndex:
              candidate
                .originalResourceIndex,
            assetHashCandidate:
              candidate
                .assetHashCandidate,
            displayContentLength:
              candidate
                .displayContentLength,
            originalContentLength:
              candidate
                .originalContentLength,
            originalMetadataOk:
              candidate
                .originalMetadataOk
              ?? false,
            originalMetadataDeferred:
              candidate
                .originalMetadataDeferred
              ?? false,
            originalMetadataStatus:
              candidate
                .originalMetadataStatus
              ?? null,
            originalMetadataResponseContentLength:
              candidate
                .originalMetadataResponseContentLength
              ?? null,
            metadataByteRatio:
              candidate
                .metadataByteRatio,
            rangeReportedTotalBytes:
              null,
            ok: false,
            status: null,
            contentType: null,
            contentRange: null,
            rangeHonored: false,
            bytesRead: 0,
            dimensionStatus:
              'failed',
            width: null,
            height: null,
            pixelCount: null,
            parser: null,
            skipReason:
              'batch-message-failed',
            durationMs: null,
            error:
              message
          })
        );

      probeResults.push(
        ...failures
      );

      batchSummaries.push({
        batchNumber:
          batchIndex + 1,
        requestedCount:
          batch.length,
        completedCount:
          failures.length,
        dimensionSuccessCount: 0,
        rangeHonoredCount: 0,
        failureCount:
          failures.length,
        bytesRead: 0,
        durationMs:
          Math.round(
            performance.now()
            - batchStartedAt
          ),
        batchMessageFailed:
          true,
        error:
          message
      });

      warnings.push({
        stage:
          'original-dimension-probe',
        code:
          'ORIGINAL_DIMENSION_PROBE_BATCH_FAILED',
        batchNumber:
          batchIndex + 1,
        count:
          batch.length,
        error:
          message
      });
    }

    if (
      batchIndex
      < batches.length - 1
    ) {
      const interBatchDelayMs =
        Math.min(
          INTER_BATCH_DELAY_MS,
          remainingProbeBudgetMs()
        );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            interBatchDelayMs
          )
      );
    }
  }

  const initialFailureCount =
    probeResults.filter(
      result =>
        result.dimensionStatus
        !== 'success'
    ).length;

  const probeResultBySampleIndex =
    new Map();

  function buildProbeAttemptHistoryEntry(
    result,
    attemptNumber,
    round
  ) {
    return {
      attemptNumber,
      round,
      ok: result?.ok ?? false,
      status: result?.status ?? null,
      rangeHonored:
        result?.rangeHonored ?? false,
      bytesRead:
        result?.bytesRead ?? 0,
      rangeReportedTotalBytes:
        result?.rangeReportedTotalBytes
        ?? result?.totalBytesFromContentRange
        ?? null,
      dimensionStatus:
        result?.dimensionStatus ?? 'unknown',
      skipReason:
        result?.skipReason ?? null,
      durationMs:
        result?.durationMs ?? null,
      error:
        result?.error ?? null
    };
  }

  for (const result of probeResults) {
    result.attemptCount = 1;
    result.retryRecovered = false;
    result.recoveredOnRetryRound = null;
    result.attemptHistory = [
      buildProbeAttemptHistoryEntry(
        result,
        1,
        0
      )
    ];

    probeResultBySampleIndex.set(
      result.sampleIndex,
      result
    );
  }

  function isRetryableProbeFailure(
    result
  ) {
    if (
      !result
      || result.dimensionStatus === 'success'
    ) {
      return false;
    }

    return result.status === 429;
  }

  const retryRoundSummaries = [];

  for (const retryConfig of RETRY_ROUNDS) {
    const retryCandidates =
      candidates.filter(
        candidate =>
          isRetryableProbeFailure(
            probeResultBySampleIndex.get(
              candidate.sampleIndex
            )
          )
      );

    if (retryCandidates.length === 0) {
      retryRoundSummaries.push({
        round: retryConfig.round,
        requestedCount: 0,
        batchCount: 0,
        recoveredCount: 0,
        remainingTransientFailureCount: 0,
        startDelayMs:
          retryConfig.startDelayMs,
        batchSize:
          retryConfig.batchSize,
        concurrency:
          retryConfig.concurrency,
        interBatchDelayMs:
          retryConfig.interBatchDelayMs,
        skipped: 'no-transient-failures'
      });
      continue;
    }

    const requiredBudgetBeforeRetry =
      retryConfig.startDelayMs
      + MIN_RETRY_REQUEST_BUDGET_MS
      + RETRY_TIME_RESERVE_MS;

    if (
      remainingProbeBudgetMs()
      < requiredBudgetBeforeRetry
    ) {
      retryRoundSummaries.push({
        round: retryConfig.round,
        eligibleCount:
          retryCandidates.length,
        requestedCount: 0,
        requestResultCount: 0,
        batchCount: 0,
        recoveredCount: 0,
        remainingTransientFailureCount:
          retryCandidates.length,
        startDelayMs:
          retryConfig.startDelayMs,
        batchSize:
          retryConfig.batchSize,
        concurrency:
          retryConfig.concurrency,
        interBatchDelayMs:
          retryConfig.interBatchDelayMs,
        skipped:
          'probe-time-budget-exceeded'
      });

      probeBudgetExceeded = true;
      continue;
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          retryConfig.startDelayMs
        )
    );

    const retryBatches = [];

    for (
      let offset = 0;
      offset < retryCandidates.length;
      offset += retryConfig.batchSize
    ) {
      retryBatches.push(
        retryCandidates.slice(
          offset,
          offset + retryConfig.batchSize
        )
      );
    }

    let recoveredCount = 0;
    let retryStartedCount = 0;
    let retryRequestCount = 0;
    let retryBatchCount = 0;
    let retryBytesRead = 0;
    let retryBudgetExceeded = false;
    const roundStartedAt = performance.now();

    for (
      let retryBatchIndex = 0;
      retryBatchIndex < retryBatches.length;
      retryBatchIndex++
    ) {
      const retryBatch =
        retryBatches[retryBatchIndex];

      const remainingBeforeRetry =
        remainingProbeBudgetMs();

      if (
        remainingBeforeRetry
        < (
          MIN_RETRY_REQUEST_BUDGET_MS
          + RETRY_TIME_RESERVE_MS
        )
      ) {
        retryBudgetExceeded = true;
        probeBudgetExceeded = true;
        break;
      }

      const retryTimeoutMs =
        Math.max(
          MIN_RETRY_REQUEST_BUDGET_MS,
          Math.min(
            PROBE_TIMEOUT_MS,
            Math.floor(
              remainingBeforeRetry
              - RETRY_TIME_RESERVE_MS
            )
          )
        );

      retryStartedCount +=
        retryBatch.length;
      retryBatchCount++;

      try {
        const response =
          await chrome.runtime.sendMessage({
            type:
              'AI_AI_PROBE_IMAGE_DIMENSIONS_BATCH',
            concurrency:
              retryConfig.concurrency,
            timeoutMs:
              retryTimeoutMs,
            prefixBytes: PREFIX_BYTES,
            resources:
              retryBatch.map(
                candidate => ({
                  sampleIndex:
                    candidate.sampleIndex,
                  displayResourceIndex:
                    candidate.displayResourceIndex,
                  originalResourceIndex:
                    candidate.originalResourceIndex,
                  assetHashCandidate:
                    candidate.assetHashCandidate,
                  url:
                    candidate.originalUrl
                })
              )
          });

        if (!response?.success) {
          throw new Error(
            response?.error
            || 'original dimension retry batch failed'
          );
        }

        const returnedBySampleIndex =
          new Map(
            (response.results ?? [])
              .map(result => [
                result.sampleIndex,
                result
              ])
          );

        for (const candidate of retryBatch) {
          const previous =
            probeResultBySampleIndex.get(
              candidate.sampleIndex
            );

          const raw =
            returnedBySampleIndex.get(
              candidate.sampleIndex
            );

          if (!raw) {
            continue;
          }

          retryRequestCount++;

          const normalized = {
            sampleIndex:
              raw.sampleIndex
              ?? candidate.sampleIndex,
            displayResourceIndex:
              raw.displayResourceIndex
              ?? candidate.displayResourceIndex,
            originalResourceIndex:
              raw.originalResourceIndex
              ?? candidate.originalResourceIndex,
            assetHashCandidate:
              raw.assetHashCandidate
              ?? candidate.assetHashCandidate,
            displayContentLength:
              candidate.displayContentLength
              ?? null,
            originalContentLength:
              candidate.originalContentLength
              ?? null,
            originalMetadataOk:
              candidate.originalMetadataOk
              ?? false,
            originalMetadataDeferred:
              candidate.originalMetadataDeferred
              ?? false,
            originalMetadataStatus:
              candidate.originalMetadataStatus
              ?? null,
            originalMetadataResponseContentLength:
              candidate.originalMetadataResponseContentLength
              ?? null,
            metadataByteRatio:
              candidate.metadataByteRatio
              ?? null,
            rangeReportedTotalBytes:
              raw.totalBytesFromContentRange
              ?? null,
            ok: raw.ok ?? false,
            status: raw.status ?? null,
            contentType:
              raw.contentType ?? null,
            contentRange:
              raw.contentRange ?? null,
            rangeHonored:
              raw.rangeHonored ?? false,
            bytesRead:
              raw.bytesRead ?? 0,
            dimensionStatus:
              raw.dimensionStatus ?? 'unknown',
            width: raw.width ?? null,
            height: raw.height ?? null,
            pixelCount:
              raw.pixelCount ?? null,
            parser: raw.parser ?? null,
            skipReason:
              raw.skipReason ?? null,
            durationMs:
              raw.durationMs ?? null,
            error: raw.error ?? null
          };

          retryBytesRead +=
            Number.isFinite(normalized.bytesRead)
              ? normalized.bytesRead
              : 0;

          const previousHistory =
            previous?.attemptHistory ?? [];

          const attemptNumber =
            previousHistory.length + 1;

          normalized.attemptHistory = [
            ...previousHistory,
            buildProbeAttemptHistoryEntry(
              normalized,
              attemptNumber,
              retryConfig.round
            )
          ];

          normalized.attemptCount =
            normalized.attemptHistory.length;

          const initiallyFailed =
            previousHistory[0]
              ?.dimensionStatus !== 'success';

          const recoveredNow =
            initiallyFailed
            && normalized.dimensionStatus
              === 'success';

          normalized.retryRecovered =
            previous?.retryRecovered === true
            || recoveredNow;

          normalized.recoveredOnRetryRound =
            recoveredNow
              ? retryConfig.round
              : previous?.recoveredOnRetryRound
                ?? null;

          if (
            previous?.dimensionStatus
              !== 'success'
            && normalized.dimensionStatus
              === 'success'
          ) {
            recoveredCount++;
          }

          probeResultBySampleIndex.set(
            candidate.sampleIndex,
            normalized
          );
        }
      }
      catch (error) {
        warnings.push({
          stage:
            'original-dimension-probe',
          code:
            'ORIGINAL_DIMENSION_PROBE_RETRY_BATCH_FAILED',
          round:
            retryConfig.round,
          retryBatchNumber:
            retryBatchIndex + 1,
          count: retryBatch.length,
          error: String(error)
        });
      }

      if (
        retryBatchIndex
        < retryBatches.length - 1
      ) {
        const budgetRequiredForNextRetry =
          retryConfig.interBatchDelayMs
          + MIN_RETRY_REQUEST_BUDGET_MS
          + RETRY_TIME_RESERVE_MS;

        if (
          remainingProbeBudgetMs()
          < budgetRequiredForNextRetry
        ) {
          retryBudgetExceeded = true;
          probeBudgetExceeded = true;
          break;
        }

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              retryConfig.interBatchDelayMs
            )
        );
      }
    }

    const remainingTransientFailureCount =
      candidates.filter(
        candidate =>
          isRetryableProbeFailure(
            probeResultBySampleIndex.get(
              candidate.sampleIndex
            )
          )
      ).length;

    retryRoundSummaries.push({
      round: retryConfig.round,
      eligibleCount:
        retryCandidates.length,
      requestedCount:
        retryStartedCount,
      requestResultCount:
        retryRequestCount,
      batchCount:
        retryBatchCount,
      recoveredCount,
      remainingTransientFailureCount,
      bytesRead:
        retryBytesRead,
      startDelayMs:
        retryConfig.startDelayMs,
      batchSize:
        retryConfig.batchSize,
      concurrency:
        retryConfig.concurrency,
      interBatchDelayMs:
        retryConfig.interBatchDelayMs,
      durationMs:
        Math.round(
          performance.now()
          - roundStartedAt
        ),
      skipped:
        retryBudgetExceeded
          ? 'probe-time-budget-exceeded'
          : null
    });
  }

  probeResults.length = 0;

  probeResults.push(
    ...Array.from(
      probeResultBySampleIndex.values()
    )
  );

  probeResults.sort(
    (a, b) =>
      (a.sampleIndex ?? 0)
      - (b.sampleIndex ?? 0)
  );

  const failureResults =
    probeResults.filter(
      result =>
        result.dimensionStatus
        !== 'success'
        && result.skipReason
          !== 'probe-time-budget-exceeded'
    );

  const budgetSkippedResults =
    probeResults.filter(
      result =>
        result.skipReason
        === 'probe-time-budget-exceeded'
    );

  if (failureResults.length > 0) {
    warnings.push({
      stage:
        'original-dimension-probe',
      code:
        'ORIGINAL_DIMENSION_PROBE_PARTIAL',
      count:
        failureResults.length,
      examples:
        failureResults.slice(0, 10)
    });
  }

  const parserCounts = {};

  for (const result of probeResults) {
    const key =
      result.parser
      || 'none';

    parserCounts[key] =
      (parserCounts[key] ?? 0)
      + 1;
  }

  const httpStatusCounts = {};

  for (const result of probeResults) {
    const key =
      result.status === null
        ? 'null'
        : String(result.status);

    httpStatusCounts[key] =
      (httpStatusCounts[key] ?? 0)
      + 1;
  }

  return {
    status:
      'completed',
    selectionStrategy:
      'all-image-candidates-budgeted-batched-range-prefix-limited-429-retry',
    candidateCount:
      candidates.length,
    selectedCount:
      probeResults.filter(
        result =>
          result.skipReason
          !== 'probe-time-budget-exceeded'
      ).length,
    completedCount:
      probeResults.length,
    batchSize:
      BATCH_SIZE,
    batchCount:
      batchSummaries.filter(
        summary =>
          (summary.requestedCount ?? 0) > 0
      ).length,
    plannedBatchCount:
      batches.length,
    concurrency:
      CONCURRENCY,
    interBatchDelayMs:
      INTER_BATCH_DELAY_MS,
    rangeHonoredCount:
      probeResults.filter(
        result =>
          result.rangeHonored
          === true
      ).length,
    rangeNotHonoredCount:
      probeResults.filter(
        result =>
          result.skipReason
          !== 'probe-time-budget-exceeded'
          && result.rangeHonored
            !== true
      ).length,
    dimensionSuccessCount:
      probeResults.filter(
        result =>
          result.dimensionStatus
          === 'success'
      ).length,
    failureCount:
      failureResults.length,
    timedOutCount:
      probeResults.filter(
        result =>
          result.skipReason
          === 'timeout'
      ).length,
    rateLimitedCount:
      probeResults.filter(
        result =>
          result.status
          === 429
      ).length,
    bytesReadTotal:
      probeResults.reduce(
        (sum, result) =>
          sum
          + (
              Number.isFinite(
                result.bytesRead
              )
                ? result.bytesRead
                : 0
            ),
        0
      ),
    prefixBytesRequested:
      PREFIX_BYTES,
    durationMs:
      Math.round(
        performance.now()
        - probeStartedAt
      ),
    parserCounts,
    httpStatusCounts,
    batchSummaries,
    initialFailureCount,
    requestTimeoutMs:
      PROBE_TIMEOUT_MS,
    totalTimeBudgetMs:
      PROBE_TOTAL_BUDGET_MS,
    timeBudgetExceeded:
      probeBudgetExceeded,
    budgetSkippedCount:
      budgetSkippedResults.length,
    unresolvedCount:
      failureResults.length
      + budgetSkippedResults.length,
    attemptedCount:
      probeResults.filter(
        result =>
          result.skipReason
          !== 'probe-time-budget-exceeded'
      ).length,
    retryEnabled: true,
    retryRoundCount:
      RETRY_ROUNDS.length,
    retryRecoveredCount:
      probeResults.filter(
        result =>
          result.retryRecovered === true
      ).length,
    retryRecoveredFrom429Count:
      probeResults.filter(
        result =>
          result.retryRecovered === true
          && result.attemptHistory
            ?.some(
              attempt =>
                attempt.status === 429
            )
      ).length,
    rateLimitEncounteredCount:
      probeResults.filter(
        result =>
          result.attemptHistory
            ?.some(
              attempt =>
                attempt.status === 429
            )
      ).length,
    totalAttemptCount:
      probeResults.reduce(
        (sum, result) =>
          sum + (result.attemptCount ?? 1),
        0
      ),
    retryRoundSummaries,
    results:
      probeResults,
    interpretationApplied:
      false,
    automaticInclusionDecisionApplied:
      false
  };
}


async function fetchOriginalGifBodiesForPackage({
  mediaDiscovery,
  mediaFetch,
  warnings
}) {
  const MAX_BYTES_PER_RESOURCE =
    16 * 1024 * 1024;

  const MAX_TOTAL_BYTES =
    32 * 1024 * 1024;

  const TOTAL_TIME_BUDGET_MS =
    15000;

  const MAX_REQUEST_TIMEOUT_MS =
    10000;

  const MIN_REQUEST_START_BUDGET_MS =
    1250;

  const REQUEST_TIME_RESERVE_MS =
    250;

  const INTER_REQUEST_DELAY_MS =
    250;

  const transferMap =
    new Map();

  const originalGifResources =
    (mediaDiscovery?.resources ?? [])
      .filter(
        resource =>
          resource.roles
            ?.includes('original-gif')
      );

  const metadataByResourceIndex =
    new Map(
      (mediaFetch?.results ?? [])
        .map(result => [
          result.resourceIndex,
          result
        ])
    );

  const candidates = [];
  const skipped = [];

  for (const resource of originalGifResources) {
    const metadata =
      metadataByResourceIndex.get(
        resource.resourceIndex
      ) ?? null;

    const expectedBytes =
      Number.isFinite(
        metadata?.responseContentLength
      )
        ? metadata.responseContentLength
        : null;

    const metadataContentType =
      metadata?.responseContentType
        ? String(metadata.responseContentType)
          .split(';')[0]
          .trim()
          .toLowerCase()
          || null
        : null;

    const clearlyNonGifMetadataMime =
      metadataContentType?.startsWith('video/')
      || metadataContentType?.startsWith('audio/')
      || metadataContentType?.startsWith('text/')
      || [
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/avif',
        'image/svg+xml',
        'application/json',
        'application/xml',
        'application/pdf'
      ].includes(metadataContentType);

    const base = {
      resourceIndex:
        resource.resourceIndex,
      resourceKey:
        resource.resourceKey,
      requestedUrl:
        resource.representativeUrl,
      roles:
        resource.roles ?? [],
      occurrenceCount:
        resource.occurrences
          ?.length
        ?? 0,
      expectedBytes,
      metadataStatus:
        metadata?.status
        ?? null,
      metadataContentType:
        metadata?.responseContentType
        ?? null,
      normalizedMetadataContentType:
        metadataContentType
    };

    if (metadata?.bodyFetched === true) {
      skipped.push({
        ...base,
        reason:
          'body-already-fetched-by-initial-media-fetch'
      });
      continue;
    }

    if (resource.fetchEligible !== true) {
      skipped.push({
        ...base,
        reason:
          'original-gif-fetch-url-unsupported'
      });
      continue;
    }

    if (
      metadata?.ok !== true
      || metadata?.fetchMode !== 'metadata'
    ) {
      skipped.push({
        ...base,
        reason:
          'original-gif-metadata-not-ready'
      });
      continue;
    }

    if (clearlyNonGifMetadataMime) {
      skipped.push({
        ...base,
        reason:
          'original-gif-metadata-mime-not-gif'
      });
      continue;
    }

    if (
      !Number.isFinite(expectedBytes)
      || expectedBytes <= 0
    ) {
      skipped.push({
        ...base,
        reason:
          'original-gif-size-unavailable'
      });
      continue;
    }

    if (expectedBytes > MAX_BYTES_PER_RESOURCE) {
      skipped.push({
        ...base,
        reason:
          'original-gif-over-resource-byte-limit',
        maxBytesPerResource:
          MAX_BYTES_PER_RESOURCE
      });
      continue;
    }

    candidates.push({
      ...base,
      resource
    });
  }

  const selected = [];
  let selectedExpectedBytes = 0;

  for (const candidate of candidates) {
    if (
      selectedExpectedBytes
      + candidate.expectedBytes
      > MAX_TOTAL_BYTES
    ) {
      skipped.push({
        resourceIndex:
          candidate.resourceIndex,
        resourceKey:
          candidate.resourceKey,
        requestedUrl:
          candidate.requestedUrl,
        roles:
          candidate.roles,
        occurrenceCount:
          candidate.occurrenceCount,
        expectedBytes:
          candidate.expectedBytes,
        metadataStatus:
          candidate.metadataStatus,
        metadataContentType:
          candidate.metadataContentType,
        reason:
          'original-gif-total-byte-budget'
      });
      continue;
    }

    selected.push({
      ...candidate,
      selectionOrder:
        selected.length
    });

    selectedExpectedBytes +=
      candidate.expectedBytes;
  }

  const baseSummary = {
    candidateCount:
      originalGifResources.length,
    metadataReadyCount:
      candidates.length,
    selectedCount:
      selected.length,
    selectedExpectedBytes,
    maxBytesPerResource:
      MAX_BYTES_PER_RESOURCE,
    maxTotalBytes:
      MAX_TOTAL_BYTES,
    timeBudgetMs:
      TOTAL_TIME_BUDGET_MS,
    maxRequestTimeoutMs:
      MAX_REQUEST_TIMEOUT_MS,
    concurrency: 1,
    retryEnabled: false,
    cacheMode:
      'no-store',
    skipped
  };

  const preFetchTechnicalSkipped =
    skipped.filter(
      item =>
        item.reason
        !== 'body-already-fetched-by-initial-media-fetch'
    );

  if (preFetchTechnicalSkipped.length > 0) {
    warnings.push({
      stage:
        'original-gif-fetch',
      code:
        'ORIGINAL_GIF_FETCH_TECHNICAL_SKIPS',
      count:
        preFetchTechnicalSkipped.length,
      examples:
        preFetchTechnicalSkipped.slice(0, 10)
    });
  }

  if (selected.length === 0) {
    return {
      summary: {
        status: 'skipped',
        reason:
          originalGifResources.length === 0
            ? 'no-original-gif-resources'
            : 'no-original-gif-within-technical-limits',
        ...baseSummary,
        attemptedCount: 0,
        successCount: 0,
        failureCount: 0,
        technicalSkippedCount:
          skipped.length,
        transferredBytes: 0,
        base64DecodeFailureCount: 0,
        decodedSizeMismatchCount: 0,
        signatureMismatchCount: 0,
        sizeMismatchCount: 0,
        rateLimitedCount: 0,
        timedOutCount: 0,
        timeBudgetExceeded: false,
        durationMs: 0,
        results: []
      },
      transferMap,
      results: []
    };
  }

  const startedAt =
    performance.now();

  const results = [];

  function originalGifElapsedMs() {
    return (
      performance.now()
      - startedAt
    );
  }

  function originalGifRemainingBudgetMs() {
    return Math.max(
      0,
      TOTAL_TIME_BUDGET_MS
      - originalGifElapsedMs()
    );
  }

  function makeTimeBudgetSkip(item) {
    return {
      selectionOrder:
        item.selectionOrder,
      resourceIndex:
        item.resourceIndex,
      resourceKey:
        item.resourceKey,
      requestedUrl:
        item.requestedUrl,
      expectedBytes:
        item.expectedBytes,
      metadataContentType:
        item.metadataContentType,
      ok: false,
      accepted: false,
      status: null,
      attempts: 0,
      rateLimitEncountered:
        false,
      bodyFetched: false,
      bodyTransferAvailable:
        false,
      actualBytes: null,
      reportedBodyTransferByteLength:
        null,
      reportedBlobSize: null,
      decodedByteLength: null,
      decodedSignature: null,
      gifSignatureValid: null,
      validatedMimeType: null,
      base64DecodeError: null,
      sizeMatchesExpected:
        null,
      responseContentType:
        null,
      responseContentLength:
        null,
      blobType: null,
      finalUrl: null,
      contentLengthMatchesBlobSize:
        null,
      skipReason:
        'skipped-technical-time-budget',
      technicalLimit:
        'original-gif-total-time-budget',
      error: null
    };
  }

  let timeBudgetExceeded =
    false;

  for (
    let index = 0;
    index < selected.length;
    index++
  ) {
    const item =
      selected[index];

    const remaining =
      originalGifRemainingBudgetMs();

    if (
      remaining
      < MIN_REQUEST_START_BUDGET_MS
    ) {
      results.push(
        ...selected
          .slice(index)
          .map(makeTimeBudgetSkip)
      );

      timeBudgetExceeded =
        true;

      warnings.push({
        stage:
          'original-gif-fetch',
        code:
          'ORIGINAL_GIF_FETCH_TIME_BUDGET_EXCEEDED',
        skippedCount:
          selected.length - index,
        timeBudgetMs:
          TOTAL_TIME_BUDGET_MS,
        elapsedMs:
          Math.round(
            originalGifElapsedMs()
          )
      });

      break;
    }

    const requestTimeoutMs =
      Math.max(
        1000,
        Math.min(
          MAX_REQUEST_TIMEOUT_MS,
          Math.floor(
            remaining
            - REQUEST_TIME_RESERVE_MS
          )
        )
      );

    let response;

    try {
      response =
        await chrome.runtime.sendMessage({
          type:
            'AI_AI_FETCH_MEDIA_BATCH',
          bodyConcurrency: 1,
          metadataConcurrency: 1,
          maxBytesPerResource:
            MAX_BYTES_PER_RESOURCE,
          bodyTimeoutMs:
            requestTimeoutMs,
          metadataTimeoutMs: 5000,
          retry429Count: 0,
          retryBaseDelayMs: 1500,
          returnBodyBase64MaxBytes:
            MAX_BYTES_PER_RESOURCE,
          returnBodyBase64MaxTotalBytes:
            MAX_BYTES_PER_RESOURCE,
          cacheMode:
            'no-store',
          resources: [
            {
              resourceIndex:
                item.resourceIndex,
              resourceKey:
                item.resourceKey,
              url:
                item.requestedUrl,
              fetchMode:
                'body'
            }
          ]
        });
    }
    catch (error) {
      response = {
        success: false,
        error:
          String(error),
        results: []
      };
    }

    const rawResult =
      response?.results?.[0]
      ?? {
        ok: false,
        status: null,
        attempts: 0,
        rateLimitEncountered:
          false,
        bodyFetched: false,
        bodyTransferAvailable:
          false,
        skipReason:
          response?.success === false
            ? 'batch-message-failed'
            : 'missing-batch-result',
        error:
          response?.error
          ?? 'Service Worker result missing'
      };

    const reportedBodyTransferByteLength =
      Number.isFinite(
        rawResult.bodyTransferByteLength
      )
        ? rawResult.bodyTransferByteLength
        : null;

    const reportedBlobSize =
      Number.isFinite(
        rawResult.blobSize
      )
        ? rawResult.blobSize
        : null;

    let decodedBytes = null;
    let base64DecodeError = null;

    if (
      rawResult.ok === true
      && rawResult.bodyFetched === true
      && rawResult.bodyTransferAvailable
        === true
    ) {
      if (
        typeof rawResult.bodyBase64
        !== 'string'
      ) {
        base64DecodeError =
          'bodyBase64 missing or not a string';
      }
      else {
        try {
          decodedBytes =
            base64ToUint8Array(
              rawResult.bodyBase64
            );
        }
        catch (error) {
          base64DecodeError =
            String(error);
        }
      }
    }

    const decodedByteLength =
      decodedBytes?.byteLength
      ?? null;

    const decodedSignature =
      decodedBytes?.byteLength >= 6
        ? String.fromCharCode(
            ...decodedBytes.subarray(
              0,
              6
            )
          )
        : null;

    const gifSignatureValid =
      decodedBytes !== null
        ? decodedSignature === 'GIF87a'
          || decodedSignature === 'GIF89a'
        : null;

    const sizeMatchesExpected =
      Number.isFinite(
        decodedByteLength
      )
        ? decodedByteLength
          === item.expectedBytes
        : null;

    let validationFailureReason = null;

    if (
      rawResult.ok === true
      && rawResult.bodyFetched === true
      && rawResult.bodyTransferAvailable
        === true
    ) {
      if (base64DecodeError !== null) {
        validationFailureReason =
          'original-gif-base64-decode-failed';
      }
      else if (sizeMatchesExpected !== true) {
        validationFailureReason =
          'original-gif-decoded-size-mismatch';
      }
      else if (gifSignatureValid !== true) {
        validationFailureReason =
          'original-gif-signature-mismatch';
      }
    }

    const accepted =
      rawResult.ok === true
      && rawResult.bodyFetched === true
      && rawResult.bodyTransferAvailable
        === true
      && validationFailureReason
        === null;

    const result = {
      selectionOrder:
        item.selectionOrder,
      resourceIndex:
        item.resourceIndex,
      resourceKey:
        item.resourceKey,
      requestedUrl:
        item.requestedUrl,
      expectedBytes:
        item.expectedBytes,
      metadataContentType:
        item.metadataContentType,
      ok:
        rawResult.ok
        ?? false,
      accepted,
      status:
        rawResult.status
        ?? null,
      attempts:
        rawResult.attempts
        ?? 1,
      rateLimitEncountered:
        rawResult.rateLimitEncountered
        ?? false,
      bodyFetched:
        rawResult.bodyFetched
        ?? false,
      bodyTransferAvailable:
        rawResult.bodyTransferAvailable
        ?? false,
      actualBytes:
        decodedByteLength,
      reportedBodyTransferByteLength,
      reportedBlobSize,
      decodedByteLength,
      decodedSignature,
      gifSignatureValid,
      validatedMimeType:
        accepted
          ? 'image/gif'
          : null,
      base64DecodeError,
      sizeMatchesExpected,
      responseContentType:
        rawResult.responseContentType
        ?? null,
      responseContentLength:
        rawResult.responseContentLength
        ?? null,
      blobType:
        rawResult.blobType
        ?? null,
      finalUrl:
        rawResult.finalUrl
        ?? null,
      contentLengthMatchesBlobSize:
        rawResult
          .contentLengthMatchesBlobSize
        ?? null,
      skipReason:
        accepted
          ? null
          : validationFailureReason
            || rawResult.skipReason
            || rawResult
              .bodyTransferSkipReason
            || (
              'original-gif-fetch-failed'
            ),
      technicalLimit: null,
      error:
        accepted
          ? null
          : rawResult.error
            ?? null
    };

    if (accepted) {
      transferMap.set(
        item.resourceIndex,
        {
          base64:
            rawResult.bodyBase64,
          mimeType:
            'image/gif',
          validatedMimeType:
            'image/gif',
          serverObservedResponseContentType:
            rawResult.responseContentType
            ?? null,
          serverObservedBlobType:
            rawResult.blobType
            ?? null,
          gifSignature:
            decodedSignature,
          finalUrl:
            rawResult.finalUrl
            ?? null,
          byteLength:
            decodedByteLength,
          base64Length:
            rawResult.bodyBase64.length,
          source:
            'original-gif-body-fetch-time-and-byte-budgeted'
        }
      );
    }

    results.push(result);

    if (
      index < selected.length - 1
      && originalGifRemainingBudgetMs()
        > (
          MIN_REQUEST_START_BUDGET_MS
          + INTER_REQUEST_DELAY_MS
        )
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            INTER_REQUEST_DELAY_MS
          )
      );
    }
  }

  if (results.length < selected.length) {
    const recordedIndexes =
      new Set(
        results.map(
          result =>
            result.resourceIndex
        )
      );

    const missing =
      selected.filter(
        item =>
          !recordedIndexes.has(
            item.resourceIndex
          )
      );

    if (missing.length > 0) {
      results.push(
        ...missing.map(makeTimeBudgetSkip)
      );
      timeBudgetExceeded =
        true;
    }
  }

  results.sort(
    (a, b) =>
      (a.selectionOrder ?? 0)
      - (b.selectionOrder ?? 0)
  );

  const acceptedResults =
    results.filter(
      result =>
        result.accepted === true
    );

  const failedResultsForWarning =
    results.filter(
      result =>
        result.accepted !== true
        && result.skipReason
          !== 'skipped-technical-time-budget'
    );

  if (failedResultsForWarning.length > 0) {
    warnings.push({
      stage:
        'original-gif-fetch',
      code:
        'ORIGINAL_GIF_FETCH_PARTIAL',
      count:
        failedResultsForWarning.length,
      examples:
        failedResultsForWarning.slice(0, 10)
    });
  }

  const base64DecodeFailureCount =
    results.filter(
      result =>
        result.skipReason
        === 'original-gif-base64-decode-failed'
    ).length;

  if (base64DecodeFailureCount > 0) {
    warnings.push({
      stage:
        'original-gif-fetch',
      code:
        'ORIGINAL_GIF_BASE64_DECODE_FAILED',
      count:
        base64DecodeFailureCount
    });
  }

  const decodedSizeMismatchCount =
    results.filter(
      result =>
        result.skipReason
        === 'original-gif-decoded-size-mismatch'
    ).length;

  if (decodedSizeMismatchCount > 0) {
    warnings.push({
      stage:
        'original-gif-fetch',
      code:
        'ORIGINAL_GIF_DECODED_SIZE_MISMATCH',
      count:
        decodedSizeMismatchCount
    });
  }

  const signatureMismatchCount =
    results.filter(
      result =>
        result.skipReason
        === 'original-gif-signature-mismatch'
    ).length;

  if (signatureMismatchCount > 0) {
    warnings.push({
      stage:
        'original-gif-fetch',
      code:
        'ORIGINAL_GIF_SIGNATURE_MISMATCH',
      count:
        signatureMismatchCount
    });
  }

  const technicalTimeSkippedCount =
    results.filter(
      result =>
        result.skipReason
        === 'skipped-technical-time-budget'
    ).length;

  return {
    summary: {
      status:
        acceptedResults.length
        === selected.length
          ? 'completed'
          : 'partial',
      ...baseSummary,
      attemptedCount:
        results.filter(
          result =>
            (result.attempts ?? 0) > 0
        ).length,
      successCount:
        acceptedResults.length,
      failureCount:
        results.length
        - acceptedResults.length,
      technicalSkippedCount:
        preFetchTechnicalSkipped.length
        + technicalTimeSkippedCount,
      transferredBytes:
        acceptedResults.reduce(
          (sum, result) =>
            sum
            + (result.actualBytes || 0),
          0
        ),
      base64DecodeFailureCount,
      decodedSizeMismatchCount,
      signatureMismatchCount,
      sizeMismatchCount:
        decodedSizeMismatchCount,
      rateLimitedCount:
        results.filter(
          result =>
            result.rateLimitEncountered
              === true
            || result.status === 429
        ).length,
      timedOutCount:
        results.filter(
          result =>
            result.skipReason === 'timeout'
        ).length,
      timeBudgetExceeded,
      durationMs:
        Math.round(
          originalGifElapsedMs()
        ),
      results
    },
    transferMap,
    results:
      acceptedResults.map(result => ({
        resourceIndex:
          result.resourceIndex,
        resourceKey:
          result.resourceKey,
        requestedUrl:
          result.requestedUrl,
        fetchMode:
          'body',
        attempts:
          result.attempts,
        rateLimitEncountered:
          result.rateLimitEncountered,
        ok: true,
        metadataFetched: true,
        bodyFetched: true,
        status:
          result.status,
        finalUrl:
          result.finalUrl,
        responseContentType:
          result.responseContentType,
        responseContentLength:
          result.responseContentLength
          ?? result.expectedBytes,
        blobType:
          result.blobType,
        blobSize:
          result.decodedByteLength,
        validatedMimeType:
          result.validatedMimeType,
        decodedSignature:
          result.decodedSignature,
        reportedBodyTransferByteLength:
          result
            .reportedBodyTransferByteLength,
        reportedBlobSize:
          result.reportedBlobSize,
        contentLengthMatchesBlobSize:
          result
            .contentLengthMatchesBlobSize,
        bodyTransferAvailable:
          true,
        bodyTransferByteLength:
          result.decodedByteLength,
        bodyTransferSkipReason:
          null,
        skipReason: null,
        error: null
      }))
  };
}


function buildEffectiveMediaFetchForPackage(
  mediaFetch,
  ...additionalFetches
) {
  const resultByIndex =
    new Map(
      (mediaFetch?.results ?? [])
        .map(result => [
          result.resourceIndex,
          result
        ])
    );

  for (const additionalFetch of additionalFetches) {
    for (
      const result
      of additionalFetch?.results ?? []
    ) {
      resultByIndex.set(
        result.resourceIndex,
        result
      );
    }
  }

  const results =
    Array.from(
      resultByIndex.values()
    ).sort(
      (a, b) =>
        (a.resourceIndex ?? 0)
        - (b.resourceIndex ?? 0)
    );

  const transferMap = new Map();

  const initialTransferMap =
    mediaFetch
      ?._bodyTransferBase64ByResourceIndex;

  if (initialTransferMap instanceof Map) {
    for (
      const [resourceIndex, transfer]
      of initialTransferMap.entries()
    ) {
      transferMap.set(
        resourceIndex,
        {
          ...transfer,
          source:
            transfer.source
            || 'initial-media-batch'
        }
      );
    }
  }

  for (const additionalFetch of additionalFetches) {
    const additionalTransferMap =
      additionalFetch?.transferMap;

    if (additionalTransferMap instanceof Map) {
      for (
        const [resourceIndex, transfer]
        of additionalTransferMap.entries()
      ) {
        transferMap.set(
          resourceIndex,
          transfer
        );
      }
    }
  }

  const effective = {
    ...mediaFetch,
    results,
    bodyFetchedCount:
      results.filter(
        result =>
          result.bodyFetched === true
      ).length,
    metadataOnlyCount:
      results.filter(
        result =>
          result.ok === true
          && result.bodyFetched !== true
          && result.fetchMode
            === 'metadata'
      ).length,
    totalFetchedBytes:
      results.reduce(
        (sum, result) =>
          sum
          + (
              result.bodyFetched === true
                ? result.blobSize || 0
                : 0
            ),
        0
      ),
    bodyTransferAvailableCount:
      transferMap.size,
    bodyTransferBytes:
      Array.from(
        transferMap.values()
      ).reduce(
        (sum, transfer) =>
          sum
          + (
              transfer.byteLength
              || 0
            ),
        0
      )
  };

  Object.defineProperty(
    effective,
    '_bodyTransferBase64ByResourceIndex',
    {
      value: transferMap,
      enumerable: false,
      configurable: false,
      writable: false
    }
  );

  return effective;
}


async function inspectImageDimensionsFromBytes({
  bytes,
  mimeType
}) {
  const normalizedMimeType =
    String(mimeType || '')
      .split(';')[0]
      .trim()
      .toLowerCase();

  if (
    !normalizedMimeType.startsWith(
      'image/'
    )
  ) {
    return {
      status: 'not-image',
      width: null,
      height: null,
      pixelCount: null,
      mimeType:
        normalizedMimeType || null,
      source: 'packaged-bytes',
      additionalNetworkRequest: false,
      method: null,
      parser: null,
      error: null
    };
  }

  if (
    !(bytes instanceof Uint8Array)
    || bytes.length === 0
  ) {
    return {
      status: 'failed',
      width: null,
      height: null,
      pixelCount: null,
      mimeType:
        normalizedMimeType,
      source: 'packaged-bytes',
      additionalNetworkRequest: false,
      method:
        'header-parser',
      parser: null,
      error:
        'packaged image bytes are unavailable'
    };
  }

  const dimensions =
    parsePackagedImageDimensions(
      bytes
    );

  if (!dimensions) {
    return {
      status: 'unresolved',
      width: null,
      height: null,
      pixelCount: null,
      mimeType:
        normalizedMimeType,
      source: 'packaged-bytes',
      additionalNetworkRequest: false,
      method:
        'header-parser',
      parser: null,
      error: null
    };
  }

  return {
    status: 'success',
    width:
      dimensions.width,
    height:
      dimensions.height,
    pixelCount:
      dimensions.width
      * dimensions.height,
    mimeType:
      normalizedMimeType,
    source:
      'packaged-bytes',
    additionalNetworkRequest:
      false,
    method:
      'header-parser',
    parser:
      dimensions.parser,
    error: null
  };
}


function parsePackagedImageDimensions(
  bytes
) {
  return (
    parsePackagedPngDimensions(
      bytes
    )
    || parsePackagedJpegDimensions(
      bytes
    )
    || parsePackagedGifDimensions(
      bytes
    )
    || parsePackagedWebpDimensions(
      bytes
    )
    || null
  );
}


function parsePackagedPngDimensions(
  bytes
) {
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
      'png-ihdr'
  };
}


function parsePackagedGifDimensions(
  bytes
) {
  if (bytes.length < 10) {
    return null;
  }

  const signature =
    String.fromCharCode(
      ...bytes.subarray(
        0,
        6
      )
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
      'gif-logical-screen'
  };
}


function parsePackagedJpegDimensions(
  bytes
) {
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
          'jpeg-sof'
      };
    }

    offset +=
      segmentLength;
  }

  return null;
}


function parsePackagedWebpDimensions(
  bytes
) {
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
        'webp-vp8x'
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
        'webp-vp8l'
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
              'webp-vp8'
          };
        }
      }
    }
  }

  return null;
}


async function prepareMediaPackageZipTest({
  post,
  mediaDiscovery,
  mediaFetch,
  warnings
}) {
  const MAX_BYTES_PER_RESOURCE =
    16 * 1024 * 1024;

  const MAX_RESOURCES = null;

  const MAX_TOTAL_BYTES =
    128 * 1024 * 1024;

  const selectionPlan =
    selectMediaPackageCoverageCandidates({
      mediaDiscovery,
      mediaFetch,
      maxBytesPerResource:
        MAX_BYTES_PER_RESOURCE,
      maxResources:
        MAX_RESOURCES,
      maxTotalBytes:
        MAX_TOTAL_BYTES
    });

  const selected =
    selectionPlan.selected;

  const packageFileName =
    `AI_AI_${post.channel || 'unknown-channel'}_${post.postNumber || 'unknown-post'}_package-v0.3.32.zip`;

  if (selected.length === 0) {
    return {
      summary: {
        status: 'skipped',
        reason:
          'no-package-coverage-candidates',
        fileName:
          packageFileName,
        maxBytesPerResource:
          MAX_BYTES_PER_RESOURCE,
        maxResources:
          MAX_RESOURCES,
        maxTotalBytes:
          MAX_TOTAL_BYTES,
        selectedCandidateCount: 0,
        resourceCount: 0,
        originalGifPackagedCount: 0,
        originalGifPackagedBytes: 0,
        totalMediaBytes: 0,
        linkedOccurrenceCount: 0,
        allSelectedCandidatesPackaged: false,
        packageRefetchCount: 0,
        packageUsesBodyTransferMapOnly:
          true,
        bodyTransferAvailableCount:
          mediaFetch
            ?.bodyTransferAvailableCount
          ?? 0,
        bodyTransferBytes:
          mediaFetch
            ?.bodyTransferBytes
          ?? 0,
        resources: [],
        occurrenceLinks: [],
        skippedResources:
          selectionPlan.skipped
      },
      files: []
    };
  }

  const files = [];
  const resources = [];
  const runtimeSkipped = [];

  for (
    let packageIndex = 0;
    packageIndex < selected.length;
    packageIndex++
  ) {
    const candidate =
      selected[packageIndex];

    const requestedUrl =
      candidate.result.requestedUrl
      || candidate.resource.representativeUrl
      || null;

    const transferMap =
      mediaFetch
        ?._bodyTransferBase64ByResourceIndex;

    const transfer =
      transferMap instanceof Map
        ? transferMap.get(
            candidate.resource.resourceIndex
          )
        : null;

    if (!transfer?.base64) {
      runtimeSkipped.push({
        resourceIndex:
          candidate.resource.resourceIndex,
        resourceKey:
          candidate.resource.resourceKey,
        roles:
          candidate.resource.roles
          ?? [],
        blobSize:
          candidate.result.blobSize
          ?? null,
        reason:
          'body-transfer-unavailable',
        transferSkipReason:
          candidate.result
            .bodyTransferSkipReason
          ?? null
      });

      warnings.push({
        stage: 'media-package-test',
        code:
          'PACKAGE_TEST_BODY_TRANSFER_MISSING',
        resourceIndex:
          candidate.resource.resourceIndex,
        transferSkipReason:
          candidate.result
            .bodyTransferSkipReason
          ?? null
      });
      continue;
    }

    try {
      const bytes =
        base64ToUint8Array(
          transfer.base64
        );

      const mimeType =
        transfer.mimeType
        || candidate.result.blobType
        || candidate.result.responseContentType
        || 'application/octet-stream';

      const roles =
        candidate.resource.roles
        ?? [];

      const shouldInspectImageDimensions =
        roles.includes('display-image')
        || roles.includes('original-image')
        || roles.includes('original-gif')
        || roles.includes('default-image');

      const imageDimensions =
        shouldInspectImageDimensions
          ? await inspectImageDimensionsFromBytes({
              bytes,
              mimeType
            })
          : null;

      const extension =
        extensionFromMimeType(
          mimeType
        );

      const resourceId =
        `media-${String(
          resources.length
        ).padStart(4, '0')}`;

      const fileName =
        `media/${resourceId}.${extension}`;

      files.push({
        name: fileName,
        data: bytes
      });

      resources.push({
        resourceId,
        sourceResourceIndex:
          candidate.resource.resourceIndex,
        resourceKey:
          candidate.resource.resourceKey,
        roles:
          candidate.resource.roles
          ?? [],
        occurrenceCount:
          candidate.resource.occurrences
            ?.length
          ?? 0,
        occurrences:
          candidate.resource.occurrences
          ?? [],
        requestedUrl,
        finalUrl:
          transfer.finalUrl
          ?? candidate.result.finalUrl
          ?? null,
        mimeType,
        ...(
          transfer.validatedMimeType
            === 'image/gif'
            ? {
                validatedMimeType:
                  transfer.validatedMimeType,
                validatedGifSignature:
                  transfer.gifSignature
                  ?? null,
                serverObservedResponseContentType:
                  transfer
                    .serverObservedResponseContentType
                  ?? null,
                serverObservedBlobType:
                  transfer.serverObservedBlobType
                  ?? null
              }
            : {}
        ),
        imageDimensions,
        bytes:
          bytes.byteLength,
        fileName,
        base64Length:
          transfer.base64Length
          ?? null,
        transferSource:
          transfer.source
          || 'initial-media-batch',
        packageRefetched:
          false
      });
    }
    catch (error) {
      runtimeSkipped.push({
        resourceIndex:
          candidate.resource.resourceIndex,
        resourceKey:
          candidate.resource.resourceKey,
        roles:
          candidate.resource.roles
          ?? [],
        blobSize:
          candidate.result.blobSize
          ?? null,
        reason:
          'package-single-pass-build-exception',
        error: String(error)
      });

      warnings.push({
        stage: 'media-package-test',
        code:
          'PACKAGE_TEST_MEDIA_EXCEPTION',
        resourceIndex:
          candidate.resource.resourceIndex,
        error: String(error)
      });
    }
  }

  const occurrenceLinks =
    resources.flatMap(resource =>
      resource.occurrences.map(
        occurrence => ({
          occurrenceIndex:
            occurrence.occurrenceIndex,
          source:
            occurrence.source,
          role:
            occurrence.role,
          resourceId:
            resource.resourceId,
          fileName:
            resource.fileName
        })
      )
    );

  const totalMediaBytes =
    resources.reduce(
      (sum, resource) =>
        sum + resource.bytes,
      0
    );

  const skippedResources = [
    ...selectionPlan.skipped,
    ...runtimeSkipped
  ];

  return {
    summary: {
      status:
        resources.length > 0
          ? 'ready'
          : 'failed',
      fileName:
        packageFileName,
      zipCompression: 'store',
      messageTransferEncoding:
        'base64-body-transfer-map-test',
      selectionMode:
        'all-display-body-fetched-original-gif-time-byte-budgeted-original-image-range-conditional',
      maxBytesPerResource:
        MAX_BYTES_PER_RESOURCE,
      maxResources:
        MAX_RESOURCES,
      maxTotalBytes:
        MAX_TOTAL_BYTES,
      bodyFetchedResourceCount:
        selectionPlan.bodyFetchedResourceCount,
      selectedCandidateCount:
        selected.length,
      resourceCount:
        resources.length,
      originalGifPackagedCount:
        resources.filter(
          resource =>
            resource.roles
              ?.includes('original-gif')
        ).length,
      originalGifPackagedBytes:
        resources
          .filter(
            resource =>
              resource.roles
                ?.includes('original-gif')
          )
          .reduce(
            (sum, resource) =>
              sum + resource.bytes,
            0
          ),
      imageDimensionAttemptedCount:
        resources.filter(
          resource =>
            resource.imageDimensions
            !== null
        ).length,
      imageDimensionSuccessCount:
        resources.filter(
          resource =>
            resource.imageDimensions
              ?.status
            === 'success'
        ).length,
      imageDimensionFailureCount:
        resources.filter(
          resource =>
            resource.imageDimensions
              ?.status
            === 'failed'
        ).length,
      totalMediaBytes,
      linkedOccurrenceCount:
        occurrenceLinks.length,
      skippedResourceCount:
        skippedResources.length,
      allSelectedCandidatesPackaged:
        resources.length
        === selected.length,
      packageRefetchCount: 0,
      packageUsesBodyTransferMapOnly:
        true,
      bodyTransferAvailableCount:
        mediaFetch
          ?.bodyTransferAvailableCount
        ?? 0,
      bodyTransferBytes:
        mediaFetch
          ?.bodyTransferBytes
        ?? 0,
      allEligibleBodyResourcesSelected:
        selectionPlan
          .allEligibleBodyResourcesSelected,
      resources,
      occurrenceLinks,
      skippedResources
    },
    files
  };
}


function buildDisplayOriginalTechnicalComparisons({
  mediaFetch,
  packageSummary
}) {
  const pairs =
    Array.isArray(
      mediaFetch
        ?.displayOriginalComparisons
    )
      ? mediaFetch
          .displayOriginalComparisons
      : [];

  const resultByIndex =
    new Map(
      (mediaFetch?.results ?? [])
        .map(result => [
          result.resourceIndex,
          result
        ])
    );

  const packageBySourceIndex =
    new Map(
      (
        packageSummary
          ?.resources
        ?? []
      ).map(resource => [
        resource.sourceResourceIndex,
        resource
      ])
    );


  function chooseComparableBytes(
    fetchResult,
    packageResource
  ) {
    if (
      Number.isFinite(
        packageResource?.bytes
      )
      && packageResource.bytes > 0
    ) {
      return {
        value:
          packageResource.bytes,
        source:
          'package-bytes'
      };
    }

    if (
      Number.isFinite(
        fetchResult?.blobSize
      )
      && fetchResult.blobSize > 0
    ) {
      return {
        value:
          fetchResult.blobSize,
        source:
          'blob-size'
      };
    }

    if (
      Number.isFinite(
        fetchResult
          ?.responseContentLength
      )
      && fetchResult
        .responseContentLength > 0
    ) {
      return {
        value:
          fetchResult
            .responseContentLength,
        source:
          'response-content-length'
      };
    }

    return {
      value: null,
      source: null
    };
  }


  function buildSide(resourceIndex) {
    const fetchResult =
      resultByIndex.get(
        resourceIndex
      ) ?? null;

    const packageResource =
      packageBySourceIndex.get(
        resourceIndex
      ) ?? null;

    const comparableBytes =
      chooseComparableBytes(
        fetchResult,
        packageResource
      );

    const imageDimensions =
      packageResource
        ?.imageDimensions
      ?? null;

    return {
      resourceIndex,

      fetchMode:
        fetchResult?.fetchMode
        ?? null,

      ok:
        fetchResult?.ok
        ?? null,

      status:
        fetchResult?.status
        ?? null,

      bodyFetched:
        fetchResult?.bodyFetched
        ?? false,

      bodyTransferAvailable:
        fetchResult
          ?.bodyTransferAvailable
        ?? false,

      contentType:
        getFetchResultMimeType(
          fetchResult
        )
        ?? packageResource
          ?.mimeType
        ?? null,

      responseContentLength:
        Number.isFinite(
          fetchResult
            ?.responseContentLength
        )
          ? fetchResult
              .responseContentLength
          : null,

      blobSize:
        Number.isFinite(
          fetchResult?.blobSize
        )
          ? fetchResult.blobSize
          : null,

      comparableBytes:
        comparableBytes.value,

      comparableBytesSource:
        comparableBytes.source,

      fetchDurationMs:
        Number.isFinite(
          fetchResult?.durationMs
        )
          ? fetchResult.durationMs
          : null,

      attempts:
        Number.isFinite(
          fetchResult?.attempts
        )
          ? fetchResult.attempts
          : null,

      rateLimitEncountered:
        fetchResult
          ?.rateLimitEncountered
        ?? false,

      skipReason:
        fetchResult?.skipReason
        ?? null,

      error:
        fetchResult?.error
        ?? null,

      packaged:
        packageResource !== null,

      packageResourceId:
        packageResource
          ?.resourceId
        ?? null,

      packageFileName:
        packageResource
          ?.fileName
        ?? null,

      packageBytes:
        Number.isFinite(
          packageResource?.bytes
        )
          ? packageResource.bytes
          : null,

      imageDimensions
    };
  }


  const items =
    pairs.map(pair => {
      const display =
        buildSide(
          pair.displayResourceIndex
        );

      const original =
        buildSide(
          pair.originalResourceIndex
        );

      const displayDimensionsReady =
        display.imageDimensions
          ?.status
        === 'success';

      const originalDimensionsReady =
        original.imageDimensions
          ?.status
        === 'success';

      const pixelDimensionsComparable =
        displayDimensionsReady
        && originalDimensionsReady;

      const samePixelDimensions =
        pixelDimensionsComparable
          ? (
              display
                .imageDimensions
                .width
              === original
                .imageDimensions
                .width
              &&
              display
                .imageDimensions
                .height
              === original
                .imageDimensions
                .height
            )
          : null;

      const displayPixelCount =
        displayDimensionsReady
          && Number.isFinite(
            display
              .imageDimensions
              .pixelCount
          )
            ? display
                .imageDimensions
                .pixelCount
            : null;

      const originalPixelCount =
        originalDimensionsReady
          && Number.isFinite(
            original
              .imageDimensions
              .pixelCount
          )
            ? original
                .imageDimensions
                .pixelCount
            : null;

      const pixelCountRatioOriginalToDisplay =
        Number.isFinite(
          displayPixelCount
        )
        && displayPixelCount > 0
        && Number.isFinite(
          originalPixelCount
        )
          ? originalPixelCount
            / displayPixelCount
          : null;

      const byteRatioOriginalToDisplay =
        Number.isFinite(
          display.comparableBytes
        )
        && display.comparableBytes > 0
        && Number.isFinite(
          original.comparableBytes
        )
          ? original.comparableBytes
            / display.comparableBytes
          : null;

      const sameContentType =
        display.contentType !== null
        && original.contentType !== null
          ? display.contentType
            === original.contentType
          : null;

      return {
        assetHashCandidate:
          pair.assetHashCandidate
          ?? null,

        kind:
          pair.kind
          ?? null,

        display,
        original,

        comparison: {
          bothBodiesFetched:
            display.bodyFetched
            === true
            && original.bodyFetched
            === true,

          bothPackaged:
            display.packaged
            === true
            && original.packaged
            === true,

          sameContentType,

          pixelDimensionsComparable,

          samePixelDimensions,

          displayPixelCount,
          originalPixelCount,

          pixelCountRatioOriginalToDisplay,

          byteRatioOriginalToDisplay,

          byteRatioSources: {
            display:
              display
                .comparableBytesSource,
            original:
              original
                .comparableBytesSource
          }
        }
      };
    });


  const imageItems =
    items.filter(
      item =>
        item.kind === 'image'
    );

  const pixelComparableItems =
    imageItems.filter(
      item =>
        item.comparison
          .pixelDimensionsComparable
        === true
    );

  return {
    summary: {
      status: 'completed',

      pairCount:
        items.length,

      imagePairCount:
        imageItems.length,

      videoPairCount:
        items.filter(
          item =>
            item.kind === 'video'
        ).length,

      bothBodiesFetchedCount:
        items.filter(
          item =>
            item.comparison
              .bothBodiesFetched
            === true
        ).length,

      bothPackagedCount:
        items.filter(
          item =>
            item.comparison
              .bothPackaged
            === true
        ).length,

      pixelDimensionsComparableCount:
        pixelComparableItems.length,

      samePixelDimensionsCount:
        pixelComparableItems.filter(
          item =>
            item.comparison
              .samePixelDimensions
            === true
        ).length,

      differentPixelDimensionsCount:
        pixelComparableItems.filter(
          item =>
            item.comparison
              .samePixelDimensions
            === false
        ).length,

      pixelDimensionsUnavailableCount:
        imageItems.length
        - pixelComparableItems.length,

      byteRatioAvailableCount:
        items.filter(
          item =>
            Number.isFinite(
              item.comparison
                .byteRatioOriginalToDisplay
            )
        ).length,

      additionalNetworkRequests: 0,

      interpretationApplied: false
    },

    items
  };
}

function buildOriginalRangeDimensionComparisons({
  originalDimensionProbe,
  packageSummary
}) {
  const packageBySourceIndex =
    new Map(
      (
        packageSummary
          ?.resources
        ?? []
      ).map(resource => [
        resource.sourceResourceIndex,
        resource
      ])
    );

  const items =
    (
      originalDimensionProbe
        ?.results
      ?? []
    ).map(result => {
      const displayPackage =
        packageBySourceIndex.get(
          result.displayResourceIndex
        ) ?? null;

      const displayDimensions =
        displayPackage
          ?.imageDimensions
        ?? null;

      const displayReady =
        displayDimensions
          ?.status
        === 'success'
        && Number.isFinite(
          displayDimensions.width
        )
        && Number.isFinite(
          displayDimensions.height
        )
        && displayDimensions.width > 0
        && displayDimensions.height > 0;

      const originalReady =
        result.dimensionStatus
        === 'success'
        && Number.isFinite(
          result.width
        )
        && Number.isFinite(
          result.height
        )
        && result.width > 0
        && result.height > 0;

      const displayPixelCount =
        displayReady
          ? displayDimensions.width
            * displayDimensions.height
          : null;

      const originalPixelCount =
        originalReady
          ? result.width
            * result.height
          : null;

      const comparable =
        Number.isFinite(
          displayPixelCount
        )
        && displayPixelCount > 0
        && Number.isFinite(
          originalPixelCount
        )
        && originalPixelCount > 0;

      const pixelCountRatioOriginalToDisplay =
        comparable
          ? originalPixelCount
            / displayPixelCount
          : null;

      const samePixelDimensions =
        comparable
          ? (
              displayDimensions.width
                === result.width
              &&
              displayDimensions.height
                === result.height
            )
          : null;

      let dimensionRelation =
        'unavailable';

      if (comparable) {
        if (samePixelDimensions) {
          dimensionRelation =
            'same-pixel-dimensions';
        }
        else if (
          originalPixelCount
          > displayPixelCount
        ) {
          dimensionRelation =
            'original-more-pixels';
        }
        else if (
          originalPixelCount
          < displayPixelCount
        ) {
          dimensionRelation =
            'original-fewer-pixels';
        }
        else {
          dimensionRelation =
            'same-pixel-count-different-shape';
        }
      }

      const displayBytesForRangeRatio =
        Number.isFinite(
          displayPackage?.bytes
        )
        && displayPackage.bytes > 0
          ? displayPackage.bytes
          : Number.isFinite(
              result.displayContentLength
            )
            && result.displayContentLength > 0
              ? result.displayContentLength
              : null;

      const rangeReportedTotalBytes =
        Number.isFinite(
          result.rangeReportedTotalBytes
        )
        && result.rangeReportedTotalBytes > 0
          ? result.rangeReportedTotalBytes
          : null;

      const rangeReportedByteRatioOriginalToDisplay =
        Number.isFinite(
          displayBytesForRangeRatio
        )
        && displayBytesForRangeRatio > 0
        && Number.isFinite(
          rangeReportedTotalBytes
        )
          ? rangeReportedTotalBytes
            / displayBytesForRangeRatio
          : null;

      return {
        sampleIndex:
          result.sampleIndex
          ?? null,
        assetHashCandidate:
          result.assetHashCandidate
          ?? null,
        displayResourceIndex:
          result.displayResourceIndex
          ?? null,
        originalResourceIndex:
          result.originalResourceIndex
          ?? null,
        probeStatus:
          result.dimensionStatus
          ?? null,
        rangeHonored:
          result.rangeHonored
          ?? false,
        dimensionRelation,
        samePixelDimensions,
        pixelCountRatioOriginalToDisplay,
        metadataByteRatioOriginalToDisplay:
          result.metadataByteRatio
          ?? null,
        rangeReportedByteRatioOriginalToDisplay,
        display: {
          packaged:
            displayPackage !== null,
          packageResourceId:
            displayPackage
              ?.resourceId
            ?? null,
          bytes:
            displayPackage
              ?.bytes
            ?? result
              .displayContentLength
            ?? null,
          width:
            displayReady
              ? displayDimensions.width
              : null,
          height:
            displayReady
              ? displayDimensions.height
              : null,
          pixelCount:
            displayPixelCount
        },
        original: {
          metadataFetchOk:
            result.originalMetadataOk
            ?? false,
          metadataFetchDeferred:
            result.originalMetadataDeferred
            ?? false,
          metadataFetchStatus:
            result.originalMetadataStatus
            ?? null,
          metadataBytes:
            result.originalContentLength
            ?? null,
          failedMetadataResponseContentLength:
            result.originalMetadataOk
              === true
              ? null
              : result
                  .originalMetadataResponseContentLength
                ?? null,
          rangeReportedTotalBytes,
          width:
            originalReady
              ? result.width
              : null,
          height:
            originalReady
              ? result.height
              : null,
          pixelCount:
            originalPixelCount,
          contentType:
            result.contentType
            ?? null,
          parser:
            result.parser
            ?? null,
          bytesRead:
            result.bytesRead
            ?? 0
        }
      };
    });

  const comparableItems =
    items.filter(
      item =>
        Number.isFinite(
          item.pixelCountRatioOriginalToDisplay
        )
    );

  const ratios =
    comparableItems
      .map(
        item =>
          item.pixelCountRatioOriginalToDisplay
      )
      .filter(
        Number.isFinite
      );

  const pixelRatioBuckets = {
    sameDimensions: 0,
    originalMoreUpTo1_25x: 0,
    originalMore1_25To1_5x: 0,
    originalMore1_5To2x: 0,
    originalMore2To4x: 0,
    originalMoreOver4x: 0,
    originalFewerPixels: 0,
    otherSamePixelCount: 0
  };

  for (const item of comparableItems) {
    const ratio =
      item.pixelCountRatioOriginalToDisplay;

    if (
      item.samePixelDimensions
      === true
    ) {
      pixelRatioBuckets
        .sameDimensions++;
    }
    else if (ratio < 1) {
      pixelRatioBuckets
        .originalFewerPixels++;
    }
    else if (ratio === 1) {
      pixelRatioBuckets
        .otherSamePixelCount++;
    }
    else if (ratio <= 1.25) {
      pixelRatioBuckets
        .originalMoreUpTo1_25x++;
    }
    else if (ratio <= 1.5) {
      pixelRatioBuckets
        .originalMore1_25To1_5x++;
    }
    else if (ratio <= 2) {
      pixelRatioBuckets
        .originalMore1_5To2x++;
    }
    else if (ratio <= 4) {
      pixelRatioBuckets
        .originalMore2To4x++;
    }
    else {
      pixelRatioBuckets
        .originalMoreOver4x++;
    }
  }

  return {
    summary: {
      status:
        items.length > 0
          ? 'completed'
          : 'skipped',
      probeResultCount:
        items.length,
      displayDimensionAvailableCount:
        items.filter(
          item =>
            Number.isFinite(
              item.display.pixelCount
            )
        ).length,
      originalDimensionAvailableCount:
        items.filter(
          item =>
            Number.isFinite(
              item.original.pixelCount
            )
        ).length,
      dimensionComparableCount:
        comparableItems.length,
      samePixelDimensionsCount:
        comparableItems.filter(
          item =>
            item.samePixelDimensions
            === true
        ).length,
      originalMorePixelsCount:
        comparableItems.filter(
          item =>
            item.dimensionRelation
            === 'original-more-pixels'
        ).length,
      originalFewerPixelsCount:
        comparableItems.filter(
          item =>
            item.dimensionRelation
            === 'original-fewer-pixels'
        ).length,
      averagePixelCountRatioOriginalToDisplay:
        ratios.length > 0
          ? ratios.reduce(
              (sum, value) =>
                sum + value,
              0
            )
            / ratios.length
          : null,
      minPixelCountRatioOriginalToDisplay:
        ratios.length > 0
          ? Math.min(...ratios)
          : null,
      maxPixelCountRatioOriginalToDisplay:
        ratios.length > 0
          ? Math.max(...ratios)
          : null,
      pixelRatioBuckets,
      rangeReportedTotalBytesAvailableCount:
        items.filter(
          item =>
            Number.isFinite(
              item.original
                .rangeReportedTotalBytes
            )
        ).length,
      metadataBytesAvailableCount:
        items.filter(
          item =>
            Number.isFinite(
              item.original
                .metadataBytes
            )
        ).length,
      metadataAndRangeBytesComparableCount:
        items.filter(
          item =>
            Number.isFinite(
              item.original
                .metadataBytes
            )
            && Number.isFinite(
              item.original
                .rangeReportedTotalBytes
            )
        ).length,
      metadataRangeBytesMatchCount:
        items.filter(
          item =>
            Number.isFinite(
              item.original
                .metadataBytes
            )
            && Number.isFinite(
              item.original
                .rangeReportedTotalBytes
            )
            && item.original.metadataBytes
              === item.original
                .rangeReportedTotalBytes
        ).length,
      metadataRangeBytesMismatchCount:
        items.filter(
          item =>
            Number.isFinite(
              item.original
                .metadataBytes
            )
            && Number.isFinite(
              item.original
                .rangeReportedTotalBytes
            )
            && item.original.metadataBytes
              !== item.original
                .rangeReportedTotalBytes
        ).length,
      metadataDeferredCount:
        items.filter(
          item =>
            item.original.metadataFetchDeferred
              === true
        ).length,
      deferredMetadataCoveredByRangeSizeCount:
        items.filter(
          item =>
            item.original.metadataFetchDeferred
              === true
            && Number.isFinite(
              item.original
                .rangeReportedTotalBytes
            )
        ).length,
      failedMetadataRecoveredByRangeSizeCount:
        items.filter(
          item =>
            item.original.metadataFetchOk
              !== true
            && item.original.metadataFetchDeferred
              !== true
            && Number.isFinite(
              item.original
                .rangeReportedTotalBytes
            )
        ).length,
      rangeReportedByteRatioAvailableCount:
        items.filter(
          item =>
            Number.isFinite(
              item.rangeReportedByteRatioOriginalToDisplay
            )
        ).length,
      interpretationApplied:
        false,
      automaticInclusionDecisionApplied:
        false
    },
    items
  };
}


function buildConditionalOriginalSelection({
  rangeComparisons,
  packageSummary,
  mediaDiscovery
}) {
  const TARGET_MEDIA_BYTES =
    120 * 1024 * 1024;

  const HARD_MEDIA_BYTES =
    128 * 1024 * 1024;

  const MAX_BYTES_PER_ORIGINAL =
    16 * 1024 * 1024;

  const MIN_PIXEL_RATIO =
    1.25;

  const baseMediaBytes =
    Number.isFinite(
      packageSummary?.totalMediaBytes
    )
      ? packageSummary.totalMediaBytes
      : 0;

  const budgetBytes =
    Math.max(
      0,
      Math.min(
        TARGET_MEDIA_BYTES,
        HARD_MEDIA_BYTES
      ) - baseMediaBytes
    );

  const resourcesByIndex =
    new Map(
      (mediaDiscovery?.resources ?? [])
        .map(resource => [
          resource.resourceIndex,
          resource
        ])
    );

  const candidates = [];
  const skipped = [];

  function skip(item, reason) {
    skipped.push({
      originalResourceIndex:
        item?.originalResourceIndex
        ?? null,
      displayResourceIndex:
        item?.displayResourceIndex
        ?? null,
      assetHashCandidate:
        item?.assetHashCandidate
        ?? null,
      pixelRatio:
        item?.pixelCountRatioOriginalToDisplay
        ?? null,
      originalBytes:
        item?.original
          ?.rangeReportedTotalBytes
        ?? null,
      reason
    });
  }

  for (
    const item
    of rangeComparisons?.items ?? []
  ) {
    const pixelRatio =
      item.pixelCountRatioOriginalToDisplay;

    const originalBytes =
      item.original
        ?.rangeReportedTotalBytes;

    const displayPixels =
      item.display?.pixelCount;

    const originalPixels =
      item.original?.pixelCount;

    const resource =
      resourcesByIndex.get(
        item.originalResourceIndex
      ) ?? null;

    if (
      !Number.isFinite(pixelRatio)
      || !Number.isFinite(originalBytes)
      || originalBytes <= 0
      || !Number.isFinite(displayPixels)
      || !Number.isFinite(originalPixels)
      || !resource?.representativeUrl
    ) {
      skip(
        item,
        'required-technical-observation-unavailable'
      );
      continue;
    }

    if (pixelRatio < MIN_PIXEL_RATIO) {
      skip(
        item,
        'pixel-ratio-below-1.25'
      );
      continue;
    }

    if (
      originalBytes
      > MAX_BYTES_PER_ORIGINAL
    ) {
      skip(
        item,
        'original-over-16mib-per-resource-limit'
      );
      continue;
    }

    let tier = 1;
    let tierName =
      'pixel-ratio-1.25-to-1.5';

    if (pixelRatio >= 4) {
      tier = 4;
      tierName =
        'pixel-ratio-at-least-4';
    }
    else if (pixelRatio >= 2) {
      tier = 3;
      tierName =
        'pixel-ratio-2-to-4';
    }
    else if (pixelRatio >= 1.5) {
      tier = 2;
      tierName =
        'pixel-ratio-1.5-to-2';
    }

    const extraPixels =
      Math.max(
        0,
        originalPixels
        - displayPixels
      );

    const extraPixelsPerOriginalByte =
      originalBytes > 0
        ? extraPixels / originalBytes
        : 0;

    candidates.push({
      originalResourceIndex:
        item.originalResourceIndex,
      displayResourceIndex:
        item.displayResourceIndex,
      assetHashCandidate:
        item.assetHashCandidate
        ?? null,
      url:
        resource.representativeUrl,
      resourceKey:
        resource.resourceKey
        ?? null,
      roles:
        resource.roles
        ?? [],
      pixelRatio,
      displayPixels,
      originalPixels,
      extraPixels,
      originalBytes,
      displayBytes:
        item.display?.bytes
        ?? null,
      rangeContentType:
        item.original?.contentType
        ?? null,
      rangeWidth:
        item.original?.width
        ?? null,
      rangeHeight:
        item.original?.height
        ?? null,
      tier,
      tierName,
      extraPixelsPerOriginalByte
    });
  }

  candidates.sort(
    (a, b) =>
      b.tier - a.tier
      || b.extraPixelsPerOriginalByte
        - a.extraPixelsPerOriginalByte
      || b.pixelRatio - a.pixelRatio
      || a.originalBytes
        - b.originalBytes
      || a.originalResourceIndex
        - b.originalResourceIndex
  );

  const selected = [];
  let selectedExpectedBytes = 0;

  for (const candidate of candidates) {
    if (
      selectedExpectedBytes
      + candidate.originalBytes
      <= budgetBytes
    ) {
      selected.push({
        ...candidate,
        selectionOrder:
          selected.length
      });

      selectedExpectedBytes +=
        candidate.originalBytes;
    }
    else {
      skipped.push({
        originalResourceIndex:
          candidate.originalResourceIndex,
        displayResourceIndex:
          candidate.displayResourceIndex,
        assetHashCandidate:
          candidate.assetHashCandidate,
        pixelRatio:
          candidate.pixelRatio,
        originalBytes:
          candidate.originalBytes,
        tier:
          candidate.tier,
        tierName:
          candidate.tierName,
        reason:
          'conditional-original-media-budget'
      });
    }
  }

  const selectedTierCounts = {};

  for (const item of selected) {
    selectedTierCounts[item.tierName] =
      (
        selectedTierCounts[item.tierName]
        ?? 0
      ) + 1;
  }

  return {
    summary: {
      status:
        candidates.length > 0
          ? 'completed'
          : 'skipped',
      policyVersion:
        'tiered-pixel-gain-budget-v1',
      candidateCount:
        candidates.length,
      selectedCount:
        selected.length,
      skippedCount:
        skipped.length,
      baseMediaBytes,
      targetMediaBytes:
        TARGET_MEDIA_BYTES,
      hardMediaBytes:
        HARD_MEDIA_BYTES,
      reservedBytesForArticleAndZip:
        HARD_MEDIA_BYTES
        - TARGET_MEDIA_BYTES,
      availableOriginalBudgetBytes:
        budgetBytes,
      selectedExpectedOriginalBytes:
        selectedExpectedBytes,
      expectedMediaBytesAfterSelection:
        baseMediaBytes
        + selectedExpectedBytes,
      maxBytesPerOriginal:
        MAX_BYTES_PER_ORIGINAL,
      minimumPixelRatio:
        MIN_PIXEL_RATIO,
      ranking:
        'pixel-ratio-tier-desc, then extra-pixels-per-original-byte-desc',
      selectedTierCounts,
      automaticInclusionDecisionApplied:
        true,
      semanticInterpretationApplied:
        false
    },
    selected,
    skipped
  };
}


async function fetchConditionalOriginalBodies({
  selection,
  warnings
}) {
  const selected =
    selection?.selected ?? [];

  // 0.3.26:
  // 조건부 원본 full fetch도 전체 실행을 과도하게 지연시키지 않도록
  // 별도의 기술 시간 예산 안에서만 수행한다.
  //
  // - 전체 단계 예산: 15초
  // - 원본은 1개씩 순차 처리
  // - 한 요청 최대 10초
  // - 자동 재시도 없음
  // - 남은 시간이 부족하면 새 요청을 시작하지 않음
  // - 미시도 원본은 URL/관계를 유지한 채 기술 제한 사유를 기록
  const TOTAL_TIME_BUDGET_MS =
    15000;

  const MAX_REQUEST_TIMEOUT_MS =
    10000;

  const MIN_REQUEST_START_BUDGET_MS =
    1250;

  const REQUEST_TIME_RESERVE_MS =
    250;

  const INITIAL_COOLDOWN_MS =
    1000;

  const INTER_REQUEST_DELAY_MS =
    250;

  const MAX_BYTES_PER_RESOURCE =
    16 * 1024 * 1024;

  const transferMap =
    new Map();

  if (selected.length === 0) {
    return {
      summary: {
        status: 'skipped',
        reason:
          'no-conditional-originals-selected',
        selectedCount: 0,
        attemptedCount: 0,
        successCount: 0,
        failureCount: 0,
        technicalSkippedCount: 0,
        transferredBytes: 0,
        sizeMismatchCount: 0,
        rateLimitedCount: 0,
        timedOutCount: 0,
        retryRecoveredCount: 0,
        retryEnabled: false,
        timeBudgetMs:
          TOTAL_TIME_BUDGET_MS,
        timeBudgetExceeded: false,
        cacheMode:
          'no-store',
        durationMs: 0,
        results: []
      },
      transferMap,
      results: []
    };
  }

  const startedAt =
    performance.now();

  const results = [];

  function elapsedMs() {
    return (
      performance.now()
      - startedAt
    );
  }

  function remainingBudgetMs() {
    return Math.max(
      0,
      TOTAL_TIME_BUDGET_MS
      - elapsedMs()
    );
  }

  function buildBaseResult(item) {
    return {
      selectionOrder:
        item.selectionOrder,
      originalResourceIndex:
        item.originalResourceIndex,
      displayResourceIndex:
        item.displayResourceIndex,
      assetHashCandidate:
        item.assetHashCandidate,
      resourceKey:
        item.resourceKey
        ?? null,
      requestedUrl:
        item.url
        ?? null,
      tier:
        item.tier,
      tierName:
        item.tierName,
      pixelRatio:
        item.pixelRatio,
      expectedBytes:
        item.originalBytes
    };
  }

  function makeTechnicalSkip(item) {
    return {
      ...buildBaseResult(item),
      ok: false,
      accepted: false,
      status: null,
      attempts: 0,
      rateLimitEncountered:
        false,
      bodyFetched: false,
      bodyTransferAvailable:
        false,
      actualBytes: null,
      sizeMatchesExpected:
        null,
      responseContentType:
        null,
      blobType: null,
      finalUrl: null,
      skipReason:
        'skipped-technical-time-budget',
      technicalLimit:
        'conditional-original-total-time-budget',
      error: null,
      retryRecovered: false,
      attemptHistory: []
    };
  }

  function normalizeAttempt(
    item,
    rawResult
  ) {
    const actualBytes =
      Number.isFinite(
        rawResult?.bodyTransferByteLength
      )
        ? rawResult.bodyTransferByteLength
        : Number.isFinite(
            rawResult?.blobSize
          )
          ? rawResult.blobSize
          : null;

    const sizeMatchesExpected =
      Number.isFinite(actualBytes)
        ? actualBytes
          === item.originalBytes
        : null;

    const accepted =
      rawResult?.ok === true
      && rawResult?.bodyFetched === true
      && rawResult?.bodyTransferAvailable
        === true
      && typeof rawResult?.bodyBase64
        === 'string'
      && sizeMatchesExpected === true;

    const result = {
      ...buildBaseResult(item),
      ok:
        rawResult?.ok
        ?? false,
      accepted,
      status:
        rawResult?.status
        ?? null,
      attempts:
        rawResult?.attempts
        ?? 1,
      rateLimitEncountered:
        rawResult?.rateLimitEncountered
        ?? false,
      bodyFetched:
        rawResult?.bodyFetched
        ?? false,
      bodyTransferAvailable:
        rawResult?.bodyTransferAvailable
        ?? false,
      actualBytes,
      sizeMatchesExpected,
      responseContentType:
        rawResult?.responseContentType
        ?? null,
      blobType:
        rawResult?.blobType
        ?? null,
      finalUrl:
        rawResult?.finalUrl
        ?? null,
      skipReason:
        rawResult?.skipReason
        ?? null,
      technicalLimit: null,
      error:
        rawResult?.error
        ?? null,
      retryRecovered: false,
      attemptHistory: [
        {
          ok:
            rawResult?.ok
            ?? false,
          status:
            rawResult?.status
            ?? null,
          attempts:
            rawResult?.attempts
            ?? 1,
          rateLimitEncountered:
            rawResult?.rateLimitEncountered
            ?? false,
          bodyFetched:
            rawResult?.bodyFetched
            ?? false,
          bodyTransferAvailable:
            rawResult?.bodyTransferAvailable
            ?? false,
          skipReason:
            rawResult?.skipReason
            ?? null,
          error:
            rawResult?.error
            ?? null
        }
      ]
    };

    if (accepted) {
      transferMap.set(
        item.originalResourceIndex,
        {
          base64:
            rawResult.bodyBase64,
          mimeType:
            rawResult.blobType
            || rawResult.responseContentType
            || item.rangeContentType
            || 'application/octet-stream',
          finalUrl:
            rawResult.finalUrl
            ?? null,
          byteLength:
            actualBytes,
          base64Length:
            rawResult.bodyBase64.length,
          source:
            'conditional-original-policy-full-fetch-time-budgeted'
        }
      );
    }

    return result;
  }

  // Range probe 직후의 연속 요청을 조금 완화한다.
  // 이 대기 시간도 15초 전체 예산에 포함한다.
  if (INITIAL_COOLDOWN_MS > 0) {
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          Math.min(
            INITIAL_COOLDOWN_MS,
            remainingBudgetMs()
          )
        )
    );
  }

  let timeBudgetExceeded =
    false;

  for (
    let index = 0;
    index < selected.length;
    index++
  ) {
    const item =
      selected[index];

    const remaining =
      remainingBudgetMs();

    if (
      remaining
      < MIN_REQUEST_START_BUDGET_MS
    ) {
      results.push(
        ...selected
          .slice(index)
          .map(
            makeTechnicalSkip
          )
      );

      timeBudgetExceeded =
        true;

      warnings.push({
        stage:
          'conditional-original-fetch',
        code:
          'CONDITIONAL_ORIGINAL_FETCH_TIME_BUDGET_EXCEEDED',
        skippedCount:
          selected.length - index,
        timeBudgetMs:
          TOTAL_TIME_BUDGET_MS,
        elapsedMs:
          Math.round(
            elapsedMs()
          )
      });

      break;
    }

    const requestTimeoutMs =
      Math.max(
        1000,
        Math.min(
          MAX_REQUEST_TIMEOUT_MS,
          Math.floor(
            remaining
            - REQUEST_TIME_RESERVE_MS
          )
        )
      );

    let response;

    try {
      response =
        await chrome.runtime.sendMessage({
          type:
            'AI_AI_FETCH_MEDIA_BATCH',
          bodyConcurrency: 1,
          metadataConcurrency: 1,
          maxBytesPerResource:
            MAX_BYTES_PER_RESOURCE,
          bodyTimeoutMs:
            requestTimeoutMs,
          metadataTimeoutMs: 5000,
          retry429Count: 0,
          retryBaseDelayMs: 1500,
          returnBodyBase64MaxBytes:
            MAX_BYTES_PER_RESOURCE,
          returnBodyBase64MaxTotalBytes:
            MAX_BYTES_PER_RESOURCE,
          cacheMode:
            'no-store',
          resources: [
            {
              resourceIndex:
                item.originalResourceIndex,
              resourceKey:
                item.resourceKey,
              url:
                item.url,
              fetchMode:
                'body'
            }
          ]
        });
    }
    catch (error) {
      response = {
        success: false,
        error:
          String(error),
        results: []
      };
    }

    const rawResult =
      response?.results?.[0]
      ?? {
        ok: false,
        status: null,
        attempts: 0,
        rateLimitEncountered:
          false,
        bodyFetched: false,
        bodyTransferAvailable:
          false,
        skipReason:
          response?.success === false
            ? 'batch-message-failed'
            : 'missing-batch-result',
        error:
          response?.error
          ?? 'Service Worker result missing'
      };

    results.push(
      normalizeAttempt(
        item,
        rawResult
      )
    );

    if (
      index < selected.length - 1
      && remainingBudgetMs()
        > (
          MIN_REQUEST_START_BUDGET_MS
          + INTER_REQUEST_DELAY_MS
        )
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            INTER_REQUEST_DELAY_MS
          )
      );
    }
  }

  // 이론상 모든 항목이 처리되기 전에 loop가 끝나는 경로가 생겨도
  // 선택된 원본의 관찰 상태가 누락되지 않도록 방어한다.
  if (results.length < selected.length) {
    const alreadyRecorded =
      new Set(
        results.map(
          result =>
            result.originalResourceIndex
        )
      );

    const missing =
      selected.filter(
        item =>
          !alreadyRecorded.has(
            item.originalResourceIndex
          )
      );

    if (missing.length > 0) {
      results.push(
        ...missing.map(
          makeTechnicalSkip
        )
      );

      timeBudgetExceeded =
        true;
    }
  }

  results.sort(
    (a, b) =>
      (a.selectionOrder ?? 0)
      - (b.selectionOrder ?? 0)
  );

  const acceptedResults =
    results.filter(
      result =>
        result.accepted === true
    );

  const technicalSkippedResults =
    results.filter(
      result =>
        result.skipReason
        === 'skipped-technical-time-budget'
    );

  const attemptedFailures =
    results.filter(
      result =>
        result.accepted !== true
        && result.skipReason
          !== 'skipped-technical-time-budget'
    );

  if (attemptedFailures.length > 0) {
    warnings.push({
      stage:
        'conditional-original-fetch',
      code:
        'CONDITIONAL_ORIGINAL_FETCH_PARTIAL',
      count:
        attemptedFailures.length,
      examples:
        attemptedFailures.slice(0, 10)
    });
  }

  const sizeMismatchCount =
    results.filter(
      result =>
        result.sizeMatchesExpected
        === false
    ).length;

  if (sizeMismatchCount > 0) {
    warnings.push({
      stage:
        'conditional-original-fetch',
      code:
        'CONDITIONAL_ORIGINAL_SIZE_MISMATCH',
      count:
        sizeMismatchCount
    });
  }

  return {
    summary: {
      status:
        acceptedResults.length
        === selected.length
          ? 'completed'
          : 'partial',
      selectedCount:
        selected.length,
      attemptedCount:
        results.filter(
          result =>
            (result.attempts ?? 0) > 0
        ).length,
      successCount:
        acceptedResults.length,
      failureCount:
        results.length
        - acceptedResults.length,
      networkOrFetchFailureCount:
        attemptedFailures.length,
      technicalSkippedCount:
        technicalSkippedResults.length,
      transferredBytes:
        acceptedResults.reduce(
          (sum, result) =>
            sum
            + (
                result.actualBytes
                || 0
              ),
          0
        ),
      expectedSelectedBytes:
        selected.reduce(
          (sum, item) =>
            sum
            + item.originalBytes,
          0
        ),
      sizeMismatchCount,
      rateLimitedCount:
        results.filter(
          result =>
            result.rateLimitEncountered
              === true
            || result.status === 429
        ).length,
      timedOutCount:
        results.filter(
          result =>
            result.skipReason
            === 'timeout'
        ).length,
      retryRecoveredCount: 0,
      retryEnabled: false,
      cacheMode:
        'no-store',
      timeBudgetMs:
        TOTAL_TIME_BUDGET_MS,
      maxRequestTimeoutMs:
        MAX_REQUEST_TIMEOUT_MS,
      timeBudgetExceeded,
      durationMs:
        Math.round(
          elapsedMs()
        ),
      results
    },
    transferMap,
    results:
      results.map(result => ({
        resourceIndex:
          result.originalResourceIndex,
        resourceKey:
          result.resourceKey
          ?? null,
        requestedUrl:
          result.requestedUrl
          ?? null,
        fetchMode:
          'body',
        attempts:
          result.attempts,
        rateLimitEncountered:
          result.rateLimitEncountered,
        ok:
          result.accepted,
        metadataFetched:
          result.accepted,
        bodyFetched:
          result.accepted,
        status:
          result.status,
        finalUrl:
          result.finalUrl,
        responseContentType:
          result.responseContentType,
        responseContentLength:
          result.expectedBytes,
        blobType:
          result.blobType,
        blobSize:
          result.actualBytes,
        bodyTransferAvailable:
          result.accepted,
        bodyTransferByteLength:
          result.actualBytes,
        skipReason:
          result.accepted
            ? null
            : result.skipReason
              || (
                result.sizeMatchesExpected
                  === false
                  ? 'body-size-mismatch'
                  : 'conditional-original-fetch-failed'
              ),
        technicalLimit:
          result.technicalLimit
          ?? null,
        error:
          result.accepted
            ? null
            : result.error
      }))
  };
}

async function appendConditionalOriginalsToPackage({
  packagePayload,
  conditionalOriginalFetch,
  mediaDiscovery,
  rangeComparisons,
  warnings
}) {
  const transferMap =
    conditionalOriginalFetch
      ?.transferMap;

  if (!(transferMap instanceof Map)) {
    return;
  }

  const resourcesByIndex =
    new Map(
      (mediaDiscovery?.resources ?? [])
        .map(resource => [
          resource.resourceIndex,
          resource
        ])
    );

  const rangeByOriginalIndex =
    new Map(
      (rangeComparisons?.items ?? [])
        .map(item => [
          item.originalResourceIndex,
          item
        ])
    );

  const packageResources =
    packagePayload.summary.resources
    ?? [];

  const occurrenceLinks =
    packagePayload.summary.occurrenceLinks
    ?? [];

  let totalMediaBytes =
    packagePayload.summary.totalMediaBytes
    ?? 0;

  let appendedCount = 0;
  let dimensionMatchCount = 0;
  let dimensionMismatchCount = 0;

  for (
    const result
    of conditionalOriginalFetch
      ?.summary
      ?.results
    ?? []
  ) {
    if (result?.accepted !== true) {
      continue;
    }

    const resourceIndex =
      result.originalResourceIndex;

    const transfer =
      transferMap.get(resourceIndex);

    const resource =
      resourcesByIndex.get(resourceIndex)
      ?? null;

    const comparison =
      rangeByOriginalIndex.get(resourceIndex)
      ?? null;

    if (
      !transfer?.base64
      || !resource
    ) {
      continue;
    }

    const bytes =
      base64ToUint8Array(
        transfer.base64
      );

    if (
      totalMediaBytes
      + bytes.byteLength
      > (
        packagePayload.summary.maxTotalBytes
        ?? 128 * 1024 * 1024
      )
    ) {
      warnings.push({
        stage:
          'media-package-test',
        code:
          'CONDITIONAL_ORIGINAL_HARD_PACKAGE_LIMIT',
        resourceIndex,
        bytes:
          bytes.byteLength
      });
      continue;
    }

    const mimeType =
      transfer.mimeType
      || comparison?.original?.contentType
      || 'application/octet-stream';

    const imageDimensions =
      await inspectImageDimensionsFromBytes({
        bytes,
        mimeType
      });

    const rangeDimensionMatch =
      imageDimensions?.status === 'success'
      && Number.isFinite(
        comparison?.original?.width
      )
      && Number.isFinite(
        comparison?.original?.height
      )
        ? imageDimensions.width
            === comparison.original.width
          && imageDimensions.height
            === comparison.original.height
        : null;

    if (rangeDimensionMatch === true) {
      dimensionMatchCount++;
    }
    else if (rangeDimensionMatch === false) {
      dimensionMismatchCount++;

      warnings.push({
        stage:
          'conditional-original-fetch',
        code:
          'CONDITIONAL_ORIGINAL_DIMENSION_MISMATCH',
        resourceIndex,
        range: {
          width:
            comparison?.original?.width
            ?? null,
          height:
            comparison?.original?.height
            ?? null
        },
        fullBody: {
          width:
            imageDimensions?.width
            ?? null,
          height:
            imageDimensions?.height
            ?? null
        }
      });
    }

    const extension =
      extensionFromMimeType(
        mimeType
      );

    const resourceId =
      `media-${String(
        packageResources.length
      ).padStart(4, '0')}`;

    const fileName =
      `media/${resourceId}.${extension}`;

    packagePayload.files.push({
      name:
        fileName,
      data:
        bytes
    });

    const packageResource = {
      resourceId,
      sourceResourceIndex:
        resource.resourceIndex,
      resourceKey:
        resource.resourceKey,
      roles:
        resource.roles ?? [],
      occurrenceCount:
        resource.occurrences
          ?.length
        ?? 0,
      occurrences:
        resource.occurrences
        ?? [],
      requestedUrl:
        resource.representativeUrl,
      finalUrl:
        transfer.finalUrl
        ?? null,
      mimeType,
      imageDimensions,
      rangeDimensionMatch,
      rangeObservedDimensions: {
        width:
          comparison?.original?.width
          ?? null,
        height:
          comparison?.original?.height
          ?? null
      },
      bytes:
        bytes.byteLength,
      fileName,
      base64Length:
        transfer.base64Length
        ?? null,
      transferSource:
        transfer.source
        || 'conditional-original-policy-full-fetch',
      packageRefetched:
        false,
      conditionalOriginalPolicy:
        true
    };

    packageResources.push(
      packageResource
    );

    for (
      const occurrence
      of resource.occurrences ?? []
    ) {
      occurrenceLinks.push({
        occurrenceIndex:
          occurrence.occurrenceIndex,
        source:
          occurrence.source,
        role:
          occurrence.role,
        resourceId,
        fileName
      });
    }

    totalMediaBytes +=
      bytes.byteLength;

    appendedCount++;
  }

  const appendedIndexes =
    new Set(
      packageResources
        .filter(
          resource =>
            resource.conditionalOriginalPolicy
              === true
        )
        .map(
          resource =>
            resource.sourceResourceIndex
        )
    );

  packagePayload.summary.skippedResources =
    (
      packagePayload.summary.skippedResources
      ?? []
    ).filter(
      skipped =>
        !appendedIndexes.has(
          skipped.resourceIndex
        )
    );

  packagePayload.summary.resources =
    packageResources;
  packagePayload.summary.occurrenceLinks =
    occurrenceLinks;
  packagePayload.summary.resourceCount =
    packageResources.length;
  packagePayload.summary.imageDimensionAttemptedCount =
    packageResources.filter(
      resource =>
        resource.imageDimensions
        !== null
    ).length;
  packagePayload.summary.imageDimensionSuccessCount =
    packageResources.filter(
      resource =>
        resource.imageDimensions
          ?.status
        === 'success'
    ).length;
  packagePayload.summary.imageDimensionFailureCount =
    packageResources.filter(
      resource =>
        resource.imageDimensions
          ?.status
        === 'failed'
    ).length;
  packagePayload.summary.totalMediaBytes =
    totalMediaBytes;
  packagePayload.summary.linkedOccurrenceCount =
    occurrenceLinks.length;
  packagePayload.summary.skippedResourceCount =
    packagePayload.summary
      .skippedResources.length;
  packagePayload.summary.conditionalOriginalPolicyApplied =
    true;
  packagePayload.summary.conditionalOriginalPackagedCount =
    appendedCount;
  packagePayload.summary.conditionalOriginalDimensionMatchCount =
    dimensionMatchCount;
  packagePayload.summary.conditionalOriginalDimensionMismatchCount =
    dimensionMismatchCount;
  packagePayload.summary.finalMediaBytesWithinHardLimit =
    totalMediaBytes
    <= (
      packagePayload.summary.maxTotalBytes
      ?? 128 * 1024 * 1024
    );
}


function selectMediaPackageCoverageCandidates({
  mediaDiscovery,
  mediaFetch,
  maxBytesPerResource,
  maxResources,
  maxTotalBytes
}) {
  const resultByIndex =
    new Map(
      (mediaFetch?.results ?? [])
        .map(result => [
          result.resourceIndex,
          result
        ])
    );

  const selected = [];
  const skipped = [];

  let selectedBytes = 0;
  let bodyFetchedResourceCount = 0;
  let eligibleBodyResourceCount = 0;

  for (
    const resource
    of mediaDiscovery?.resources ?? []
  ) {
    const result =
      resultByIndex.get(
        resource.resourceIndex
      )
      ?? null;

    const blobSize =
      Number.isFinite(
        result?.blobSize
      )
        ? result.blobSize
        : null;

    const base = {
      resourceIndex:
        resource.resourceIndex,
      resourceKey:
        resource.resourceKey,
      roles:
        resource.roles
        ?? [],
      fetchMode:
        result?.fetchMode
        ?? null,
      bodyFetched:
        result?.bodyFetched
        ?? false,
      blobSize
    };

    if (
      result?.bodyFetched
      !== true
    ) {
      skipped.push({
        ...base,
        reason:
          result?.fetchMode
            === 'metadata'
          ? 'metadata-only-not-packaged'
          : 'body-not-fetched'
      });
      continue;
    }

    bodyFetchedResourceCount++;

    if (
      !Number.isFinite(blobSize)
      || blobSize <= 0
    ) {
      skipped.push({
        ...base,
        reason:
          'body-size-unavailable'
      });
      continue;
    }

    if (
      blobSize
      > maxBytesPerResource
    ) {
      skipped.push({
        ...base,
        reason:
          'resource-over-test-limit'
      });
      continue;
    }

    eligibleBodyResourceCount++;

    if (
      Number.isFinite(maxResources)
      && selected.length
      >= maxResources
    ) {
      skipped.push({
        ...base,
        reason:
          'package-resource-count-limit'
      });
      continue;
    }

    if (
      selectedBytes + blobSize
      > maxTotalBytes
    ) {
      skipped.push({
        ...base,
        reason:
          'package-total-bytes-limit'
      });
      continue;
    }

    selected.push({
      resource,
      result
    });

    selectedBytes +=
      blobSize;
  }

  return {
    selected,
    skipped,
    selectedBytes,
    bodyFetchedResourceCount,
    eligibleBodyResourceCount,
    allEligibleBodyResourcesSelected:
      selected.length
      === eligibleBodyResourceCount
  };
}


function getFetchResultMimeType(
  result
) {
  const value =
    result?.blobType
    || result?.responseContentType
    || null;

  if (!value) {
    return null;
  }

  return String(value)
    .split(';')[0]
    .trim()
    .toLowerCase()
    || null;
}


function attachPackageResourceReferences(
  mediaDiscovery,
  packageResources
) {
  const resourceIdByIndex =
    new Map(
      packageResources.map(
        resource => [
          resource.sourceResourceIndex,
          resource
        ]
      )
    );

  for (
    const resource
    of mediaDiscovery.resources ?? []
  ) {
    const packaged =
      resourceIdByIndex.get(
        resource.resourceIndex
      );

    resource.packageResourceId =
      packaged?.resourceId
      ?? null;

    resource.packageFileName =
      packaged?.fileName
      ?? null;
  }

  const occurrenceToPackage =
    new Map();

  for (const packaged of packageResources) {
    for (
      const occurrence
      of packaged.occurrences ?? []
    ) {
      occurrenceToPackage.set(
        occurrence.occurrenceIndex,
        packaged
      );
    }
  }

  for (
    const occurrence
    of mediaDiscovery.occurrences ?? []
  ) {
    const packaged =
      occurrenceToPackage.get(
        occurrence.occurrenceIndex
      );

    occurrence.packageResourceId =
      packaged?.resourceId
      ?? null;

    occurrence.packageFileName =
      packaged?.fileName
      ?? null;
  }
}


function base64ToUint8Array(
  base64
) {
  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


function extensionFromMimeType(
  mimeType
) {
  const normalized =
    String(mimeType || '')
      .split(';')[0]
      .trim()
      .toLowerCase();

  const map = {
    'image/webp': 'webp',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a'
  };

  return map[normalized]
    ?? 'bin';
}


function cloneAiConsumerValue(
  value,
  shouldOmit,
  path = []
) {
  if (Array.isArray(value)) {
    return value.map(
      (item, index) =>
        cloneAiConsumerValue(
          item,
          shouldOmit,
          [
            ...path,
            index
          ]
        )
    );
  }

  if (
    value === null
    || typeof value !== 'object'
  ) {
    return value;
  }

  const cloned = {};

  for (
    const [key, childValue]
    of Object.entries(value)
  ) {
    if (
      shouldOmit?.({
        key,
        value: childValue,
        parent: value,
        path
      })
    ) {
      continue;
    }

    cloned[key] =
      cloneAiConsumerValue(
        childValue,
        shouldOmit,
        [
          ...path,
          key
        ]
      );
  }

  return cloned;
}


function buildAiConsumerComments(
  comments
) {
  return cloneAiConsumerValue(
    comments,
    ({ key, path }) =>
      key === 'commentCollectionDurationMs'
      || key
        === 'totalCommentPageFetchDurationMs'
      || (
        key === 'durationMs'
        && path.includes('fetchReports')
      )
  );
}


function buildAiConsumerMedia(media) {
  const omittedTopLevelSections =
    new Set([
      'policy'
    ]);

  const omittedRuntimeKeys =
    new Set([
      'durationMs',
      'fetchDurationMs',
      'retryWaitMsTotal',
      'cacheControl',
      'acceptRanges',
      'retryAfterMs',
      'bodyTransferEncoding',
      'bodyTransferBase64Length',
      'base64Length',
      'messageTransferEncoding',
      'transferSource',
      'packageRefetched'
    ]);

  const omittedFetchKeys =
    new Set([
      'bodyBatchCount',
      'originalMetadataBatchCount',
      'bodyPriorityCompletedBeforeOriginalMetadata',
      'batchSummaries',
      'retryCount'
    ]);

  const omittedOriginalDimensionProbeKeys =
    new Set([
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
    ]);

  const omittedOriginalGifFetchKeys =
    new Set([
      'maxRequestTimeoutMs',
      'retryEnabled',
      'cacheMode'
    ]);

  const omittedConditionalOriginalFetchKeys =
    new Set([
      'maxRequestTimeoutMs',
      'cacheMode',
      'retryEnabled',
      'retryRecoveredCount'
    ]);

  const omittedOriginalPolicySummaryKeys =
    new Set([
      'policyVersion',
      'ranking',
      'automaticInclusionDecisionApplied',
      'semanticInterpretationApplied'
    ]);

  const omittedPackageTestKeys =
    new Set([
      'zipCompression',
      'selectionMode',
      'packageRefetchCount',
      'packageUsesBodyTransferMapOnly',
      'bodyTransferAvailableCount',
      'bodyTransferBytes'
    ]);

  const cloned = cloneAiConsumerValue(
    media,
    ({
      key,
      value,
      parent,
      path
    }) => {
      if (
        path.length === 0
        && omittedTopLevelSections.has(key)
      ) {
        return true;
      }


      const section = path[0];

      if (
        section === 'fetch'
        && omittedFetchKeys.has(key)
      ) {
        return true;
      }

      if (
        section === 'originalDimensionProbe'
        && omittedOriginalDimensionProbeKeys
          .has(key)
      ) {
        return true;
      }

      if (
        section === 'originalGifFetch'
        && omittedOriginalGifFetchKeys.has(key)
      ) {
        return true;
      }

      if (
        section === 'conditionalOriginalFetch'
        && omittedConditionalOriginalFetchKeys
          .has(key)
      ) {
        return true;
      }

      if (
        section === 'originalPolicySelection'
        && path[1] === 'summary'
        && omittedOriginalPolicySummaryKeys
          .has(key)
      ) {
        return true;
      }

      if (
        section
          === 'originalRangeDimensionComparisons'
        && path[1] === 'summary'
        && (
          key === 'interpretationApplied'
          || key
            === 'automaticInclusionDecisionApplied'
        )
      ) {
        return true;
      }

      if (
        section
          === 'displayOriginalTechnicalComparisons'
        && path[1] === 'summary'
        && key === 'interpretationApplied'
      ) {
        return true;
      }

      if (
        section === 'packageTest'
        && path.length === 1
        && omittedPackageTestKeys.has(key)
      ) {
        return true;
      }

      return (
        omittedRuntimeKeys.has(key)
        || /(?:batchSize|concurrency|interBatchDelayMs)$/i
          .test(key)
      );
    }
  );


  return cloned;
}


function buildAiConsumerSummary(summary) {
  const omittedSummaryKeys =
    new Set([
      'durationMs',
      'commentCollectionDurationMs',
      'totalCommentPageFetchDurationMs',
      'originalDimensionProbeDurationMs',
    ]);

  const omittedSummaryTransportKeys =
    new Set([
      'packageTestUsesBodyTransferMapOnly',
      'bodyTransferAvailableCount',
      'bodyTransferBytes'
    ]);

  return cloneAiConsumerValue(
    summary,
    ({ key }) =>
      omittedSummaryKeys.has(key)
      || omittedSummaryTransportKeys.has(key)
      || /(?:batch.*Count|retry.*Count|refetch.*Count)$/i
        .test(key)
  );
}


function buildAiConsumerPayload(result) {
  return {
    extraction: {
      version:
        result?.extraction?.version
        ?? null
    },
    post:
      cloneAiConsumerValue(result?.post),
    stats:
      cloneAiConsumerValue(result?.stats),
    preview:
      cloneAiConsumerValue(result?.preview),
    presentation:
      cloneAiConsumerValue(
        result?.presentation
      ),
    series:
      cloneAiConsumerValue(result?.series),
    body:
      cloneAiConsumerValue(result?.body),
    comments:
      buildAiConsumerComments(
        result?.comments
      ),
    media:
      buildAiConsumerMedia(result?.media),
    diagnostics: {
      warnings:
        cloneAiConsumerValue(
          result?.diagnostics?.warnings
          ?? []
        ),
      errors:
        cloneAiConsumerValue(
          result?.diagnostics?.errors
          ?? []
        )
    },
    summary:
      buildAiConsumerSummary(
        result?.summary
      )
  };
}


async function downloadMediaPackageZipTest(
  result,
  mediaFiles,
  packageFileName
) {
  const aiConsumerPayload =
    buildAiConsumerPayload(result);

  const articleJson =
    JSON.stringify(
      aiConsumerPayload,
      null,
      2
    );

  const encoder =
    new TextEncoder();

  const files = [
    {
      name: 'article.json',
      data:
        encoder.encode(
          articleJson
        )
    },
    ...mediaFiles
  ];

  const zipBytes =
    createZipStore(files);

  const saveResult =
    await saveGeneratedArtifact({
      bytes: zipBytes,
      mimeType: 'application/zip',
      fileName: packageFileName,
      artifactKind: 'package-zip'
    });

  return {
    fileName:
      saveResult.fileName
      || packageFileName,
    delivery: {
      artifactKind: 'package-zip',
      save: saveResult
    }
  };
}


function createZipStore(files) {
  const encoder =
    new TextEncoder();

  const localParts = [];
  const centralParts = [];

  let localOffset = 0;

  const date = new Date();
  const dos =
    dateToDosDateTime(date);

  for (const file of files) {
    const nameBytes =
      encoder.encode(file.name);

    const data =
      file.data instanceof Uint8Array
        ? file.data
        : new Uint8Array(file.data);

    const crc =
      crc32(data);

    const localHeader =
      new Uint8Array(
        30 + nameBytes.length
      );

    const localView =
      new DataView(
        localHeader.buffer
      );

    localView.setUint32(
      0,
      0x04034b50,
      true
    );
    localView.setUint16(4, 20, true);
    localView.setUint16(
      6,
      0x0800,
      true
    );
    localView.setUint16(8, 0, true);
    localView.setUint16(
      10,
      dos.time,
      true
    );
    localView.setUint16(
      12,
      dos.date,
      true
    );
    localView.setUint32(14, crc, true);
    localView.setUint32(
      18,
      data.length,
      true
    );
    localView.setUint32(
      22,
      data.length,
      true
    );
    localView.setUint16(
      26,
      nameBytes.length,
      true
    );
    localView.setUint16(28, 0, true);

    localHeader.set(
      nameBytes,
      30
    );

    localParts.push(
      localHeader,
      data
    );

    const centralHeader =
      new Uint8Array(
        46 + nameBytes.length
      );

    const centralView =
      new DataView(
        centralHeader.buffer
      );

    centralView.setUint32(
      0,
      0x02014b50,
      true
    );
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(
      8,
      0x0800,
      true
    );
    centralView.setUint16(10, 0, true);
    centralView.setUint16(
      12,
      dos.time,
      true
    );
    centralView.setUint16(
      14,
      dos.date,
      true
    );
    centralView.setUint32(16, crc, true);
    centralView.setUint32(
      20,
      data.length,
      true
    );
    centralView.setUint32(
      24,
      data.length,
      true
    );
    centralView.setUint16(
      28,
      nameBytes.length,
      true
    );
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(
      42,
      localOffset,
      true
    );

    centralHeader.set(
      nameBytes,
      46
    );

    centralParts.push(
      centralHeader
    );

    localOffset +=
      localHeader.length
      + data.length;
  }

  const centralDirectory =
    concatUint8Arrays(
      centralParts
    );

  const localData =
    concatUint8Arrays(
      localParts
    );

  const end =
    new Uint8Array(22);

  const endView =
    new DataView(end.buffer);

  endView.setUint32(
    0,
    0x06054b50,
    true
  );
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(
    8,
    files.length,
    true
  );
  endView.setUint16(
    10,
    files.length,
    true
  );
  endView.setUint32(
    12,
    centralDirectory.length,
    true
  );
  endView.setUint32(
    16,
    localData.length,
    true
  );
  endView.setUint16(20, 0, true);

  return concatUint8Arrays([
    localData,
    centralDirectory,
    end
  ]);
}


function concatUint8Arrays(parts) {
  const totalLength =
    parts.reduce(
      (sum, part) =>
        sum + part.length,
      0
    );

  const output =
    new Uint8Array(
      totalLength
    );

  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}


function dateToDosDateTime(date) {
  const year =
    Math.max(
      1980,
      date.getFullYear()
    );

  return {
    time:
      (date.getHours() << 11)
      | (date.getMinutes() << 5)
      | Math.floor(
          date.getSeconds() / 2
        ),
    date:
      ((year - 1980) << 9)
      | ((date.getMonth() + 1) << 5)
      | date.getDate()
  };
}


let crc32TableCache = null;


function crc32(bytes) {
  if (!crc32TableCache) {
    crc32TableCache =
      buildCrc32Table();
  }

  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc =
      crc32TableCache[
        (crc ^ byte) & 0xff
      ]
      ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff)
    >>> 0;
}


function buildCrc32Table() {
  const table =
    new Uint32Array(256);

  for (
    let i = 0;
    i < 256;
    i++
  ) {
    let value = i;

    for (
      let bit = 0;
      bit < 8;
      bit++
    ) {
      value =
        (value & 1)
          ? 0xedb88320
            ^ (value >>> 1)
          : value >>> 1;
    }

    table[i] = value >>> 0;
  }

  return table;
}


function downloadBinaryFile(
  bytes,
  mimeType,
  fileName
) {
  const blob =
    new Blob(
      [bytes],
      {
        type: mimeType
      }
    );

  const objectUrl =
    URL.createObjectURL(blob);

  const link =
    document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        objectUrl
      ),
    1000
  );
}


function toTransferableArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) {
    return bytes;
  }

  if (ArrayBuffer.isView(bytes)) {
    if (
      bytes.byteOffset === 0
      && bytes.byteLength
        === bytes.buffer.byteLength
    ) {
      return bytes.buffer;
    }

    return bytes.slice().buffer;
  }

  throw new TypeError(
    'generated artifact bytes must be an ArrayBuffer view'
  );
}


async function routeGeneratedArtifact(
  artifact,
  {
    attemptCustomSave =
      saveArtifactToCustomDirectory,
    defaultDownload =
      downloadBinaryFile
  } = {}
) {
  const originalBytes = artifact.bytes;

  let customResult;

  try {
    customResult =
      await attemptCustomSave(artifact);
  }
  catch (error) {
    customResult = {
      status:
        'custom-save-exception',
      reason:
        'custom-save-exception',
      ownershipTransferred: false,
      error: String(error)
    };
  }

  if (customResult?.status === 'complete') {
    return {
      ...customResult,
      route: 'custom'
    };
  }

  let fallbackBytes = originalBytes;

  if (customResult?.ownershipTransferred) {
    if (
      customResult.returnedBuffer
        instanceof ArrayBuffer
      && customResult
        .returnedBuffer
        .byteLength > 0
    ) {
      fallbackBytes =
        customResult.returnedBuffer;
    }
    else {
      console.error(
        '[AI_AI] 사용자 지정 폴더 저장 실패 후 bytes ownership을 회수하지 못했습니다.',
        customResult
      );

      return {
        status:
          'delivery-failed',
        route: 'custom',
        fileName:
          artifact.fileName,
        reason:
          customResult?.reason
          || 'returned-buffer-unavailable',
        fallbackCompleted: false
      };
    }
  }

  defaultDownload(
    fallbackBytes,
    artifact.mimeType,
    artifact.fileName
  );

  if (
    customResult?.reason
    && customResult.reason !== 'default-mode'
  ) {
    console.warn(
      '[AI_AI] 사용자 지정 폴더를 사용할 수 없어 Chrome 기본 다운로드로 저장했습니다.',
      {
        reason:
          customResult.reason,
        fileName:
          artifact.fileName
      }
    );
  }

  return {
    status: 'complete',
    route: 'default',
    fileName: artifact.fileName,
    reason:
      customResult?.reason
      || 'default-mode',
    fallbackCompleted: true
  };
}


async function saveGeneratedArtifact({
  bytes,
  fileName,
  mimeType,
  artifactKind
}) {
  return routeGeneratedArtifact({
    bytes,
    fileName,
    mimeType,
    artifactKind
  });
}


async function saveArtifactToCustomDirectory(
  artifact
) {
  const byteLength =
    artifact.bytes instanceof ArrayBuffer
      ? artifact.bytes.byteLength
      : artifact.bytes?.byteLength;

  const prepare =
    await chrome.runtime.sendMessage(
      buildSavePrepareMessage(
        artifact,
        byteLength
      )
    );

  if (
    !prepare?.success
    || prepare.status
      !== 'custom-prepare-ready'
  ) {
    return {
      status: 'not-used',
      reason:
        prepare?.status === 'default'
          ? 'default-mode'
          : prepare?.reason
            || 'save-prepare-failed',
      ownershipTransferred: false
    };
  }

  const bridge =
    await openSaveBridge(
      prepare.nonce
    );

  if (
    bridge.firstMessage?.type
    !== 'AI_AI_SAVE_READY'
  ) {
    const reason =
      bridge.firstMessage?.reason
      || bridge.firstMessage?.status
      || 'save-bridge-not-ready';

    bridge.close();

    return {
      status: 'not-ready',
      reason,
      permission:
        bridge.firstMessage
          ?.permission
        ?? null,
      permissionRequestAttempted:
        bridge.firstMessage
          ?.permissionRequestAttempted
        ?? false,
      ownershipTransferred: false
    };
  }

  const buffer =
    toTransferableArrayBuffer(
      artifact.bytes
    );

  const byteLengthBeforeTransfer =
    buffer.byteLength;

  const resultWait =
    waitForSavePortMessage(
      bridge.port
    );

  try {
    bridge.port.postMessage(
      {
        type: 'AI_AI_SAVE_WRITE',
        buffer
      },
      [buffer]
    );
  }
  catch (error) {
    resultWait.cancel();
    bridge.close();

    return {
      status:
        'buffer-transfer-failed',
      reason:
        'buffer-transfer-failed',
      error: String(error),
      ownershipTransferred:
        buffer.byteLength === 0,
      returnedBuffer:
        buffer.byteLength > 0
          ? buffer
          : null
    };
  }

  const byteLengthAfterTransfer =
    buffer.byteLength;

  let result;

  try {
    result = await resultWait.promise;
  }
  catch (error) {
    bridge.close();

    return {
      status:
        'write-result-unavailable',
      reason:
        'write-result-unavailable',
      error: String(error),
      byteLengthBeforeTransfer,
      byteLengthAfterTransfer,
      ownershipTransferred: true,
      returnedBuffer: null
    };
  }

  bridge.close();

  if (
    result?.type
    === 'AI_AI_SAVE_COMPLETE'
  ) {
    return {
      status: 'complete',
      fileName:
        result.fileName,
      byteLength:
        result.byteLength,
      byteLengthBeforeTransfer,
      byteLengthAfterTransfer,
      ownershipTransferred: true
    };
  }

  return {
    status:
      result?.status
      || 'write-failed',
    reason:
      result?.reason
      || 'write-failed',
    error:
      result?.error
      ?? null,
    byteLengthBeforeTransfer,
    byteLengthAfterTransfer,
    ownershipTransferred: true,
    returnedBuffer:
      result?.returnedBuffer
      instanceof ArrayBuffer
        ? result.returnedBuffer
        : null
  };
}


function buildSavePrepareMessage(
  artifact,
  byteLength = artifact.bytes?.byteLength
) {
  return {
    type: 'AI_AI_SAVE_PREPARE',
    artifactKind:
      artifact.artifactKind,
    fileName:
      artifact.fileName,
    byteLength
  };
}


function openSaveBridge(nonce) {
  return new Promise(
    (resolve, reject) => {
      const iframe =
        document.createElement(
          'iframe'
        );

      iframe.hidden = true;
      iframe.src =
        chrome.runtime.getURL(
          'save-bridge.html'
        );

      const extensionOrigin =
        new URL(
          chrome.runtime.getURL('/')
        ).origin;

      const channel =
        new MessageChannel();

      const timeoutId =
        setTimeout(
          () => {
            channel.port1.close();
            iframe.remove();
            reject(
              new Error(
                'save bridge ready timeout'
              )
            );
          },
          15000
        );

      channel.port1.addEventListener(
        'message',
        event => {
          clearTimeout(timeoutId);

          resolve({
            iframe,
            port: channel.port1,
            firstMessage: event.data,
            close() {
              channel.port1.close();
              iframe.remove();
            }
          });
        },
        { once: true }
      );

      channel.port1.start();

      iframe.addEventListener(
        'load',
        () => {
          iframe.contentWindow
            .postMessage(
              {
                type:
                  'AI_AI_SAVE_CONNECT',
                nonce
              },
              extensionOrigin,
              [channel.port2]
            );
        },
        { once: true }
      );

      document.documentElement
        .appendChild(iframe);
    }
  );
}


function waitForSavePortMessage(
  port,
  timeoutMs = 180000
) {
  let timeoutId;
  let messageListener;
  let settled = false;
  let rejectPromise;

  const promise = new Promise(
    (resolve, reject) => {
      rejectPromise = reject;

      messageListener = event => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        resolve(event.data);
      };

      timeoutId = setTimeout(
        () => {
          if (settled) {
            return;
          }

          settled = true;
          port.removeEventListener(
            'message',
            messageListener
          );
          reject(
            new Error(
              'custom save result timeout'
            )
          );
        },
        timeoutMs
      );

      port.addEventListener(
        'message',
        messageListener,
        { once: true }
      );
    }
  );

  return {
    promise,
    cancel() {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      port.removeEventListener(
        'message',
        messageListener
      );
      rejectPromise(
        new Error(
          'custom save result cancelled'
        )
      );
      promise.catch(() => {});
    }
  };
}


function appendMediaDiagnostics(
  media,
  warnings
) {
  const discovery =
    media.discovery;

  const fetchResult =
    media.fetch;

  if (
    discovery.unsupportedResourceCount
    > 0
  ) {
    warnings.push({
      stage: 'media-discovery',
      code:
        'UNSUPPORTED_MEDIA_FETCH_URLS',
      count:
        discovery
          .unsupportedResourceCount
    });
  }


  if (
    fetchResult.failureCount
    > 0
  ) {
    warnings.push({
      stage: 'media-fetch',
      code:
        'MEDIA_FETCH_FAILURES',
      count:
        fetchResult.failureCount,
      examples:
        fetchResult.results
          .filter(
            result =>
              result.ok !== true
          )
          .slice(0, 10)
    });
  }

  if (
    fetchResult.rateLimitedCount
    > 0
  ) {
    warnings.push({
      stage: 'media-fetch',
      code:
        'MEDIA_RATE_LIMIT_ENCOUNTERED',
      count:
        fetchResult.rateLimitedCount,
      retryCount:
        fetchResult.retryCount
    });
  }

  if (
    fetchResult.timedOutCount
    > 0
  ) {
    warnings.push({
      stage: 'media-fetch',
      code:
        'MEDIA_FETCH_TIMEOUTS',
      count:
        fetchResult.timedOutCount,
      examples:
        fetchResult.results
          .filter(
            result =>
              result.skipReason
                === 'timeout'
          )
          .slice(0, 10)
    });
  }

  const largeSkipped =
    fetchResult.results
      .filter(
        result =>
          result.skipReason
          === 'content-length-exceeds-limit'
      );

  if (largeSkipped.length > 0) {
    warnings.push({
      stage: 'media-fetch',
      code:
        'MEDIA_BODY_SKIPPED_TOO_LARGE',
      count:
        largeSkipped.length,
      examples:
        largeSkipped.slice(0, 10)
    });
  }
}


function appendLinkDiagnostics(
  {
    body,
    comments
  },
  warnings
) {
  const examples = [];

  for (
    let i = 0;
    i < (body?.sequence?.length ?? 0);
    i++
  ) {
    const item =
      body.sequence[i];

    if (
      item.type === 'link'
      && item.unresolvedHref
    ) {
      examples.push({
        source:
          `body.sequence[${i}]`,
        text: item.text,
        evidence:
          item.unresolvedEvidence
      });
    }
  }

  for (
    let commentIndex = 0;
    commentIndex
      < (comments?.items?.length ?? 0);
    commentIndex++
  ) {
    const comment =
      comments.items[commentIndex];

    for (
      let linkIndex = 0;
      linkIndex
        < (comment.links?.length ?? 0);
      linkIndex++
    ) {
      const link =
        comment.links[linkIndex];

      if (link.unresolvedHref) {
        examples.push({
          source:
            `comments.items[${commentIndex}].links[${linkIndex}]`,
          text:
            link.text,
          evidence:
            link.unresolvedEvidence
        });
      }
    }

    for (
      let partIndex = 0;
      partIndex
        < (comment.contentParts?.length ?? 0);
      partIndex++
    ) {
      const part =
        comment.contentParts[
          partIndex
        ];

      if (
        part.type === 'link'
        && part.unresolvedHref
      ) {
        examples.push({
          source:
            `comments.items[${commentIndex}].contentParts[${partIndex}]`,
          text:
            part.text,
          evidence:
            part.unresolvedEvidence
        });
      }
    }
  }

  if (examples.length > 0) {
    warnings.push({
      stage: 'link',
      code: 'UNRESOLVED_LINK_HREF',
      count:
        examples.length,
      examples:
        examples.slice(0, 10)
    });
  }
}


function buildTopSummary(result) {
  return {
    post: {
      channel: result.post.channel,
      postNumber: result.post.postNumber,
      title: result.post.title,
      category: result.post.category,
      author: result.post.author
    },

    body:
      result.body.summary,

    series: {
      hasSeries:
        result.series.hasSeries,
      itemCount:
        result.series.items.length,
      currentIndex:
        result.series.currentIndex
    },

    presentation: {
      spoilerAlertCount:
        result.presentation
          .spoiler
          .alertCount,
      spoilerActiveFilterCount:
        result.presentation
          .spoiler
          .activeFilterCount,
      blurCount:
        result.presentation
          .blur
          .count
    },

    comments:
      result.comments.summary,

    media: {
      occurrenceCount:
        result.media
          .discovery
          .occurrenceCount,
      uniqueResourceCount:
        result.media
          .discovery
          .uniqueResourceCount,
      fetchEligibleCount:
        result.media
          .discovery
          .fetchEligibleCount,
      requestedResources:
        result.media
          .fetch
          .requestedResources,
      successCount:
        result.media
          .fetch
          .successCount,
      failureCount:
        result.media
          .fetch
          .failureCount,
      bodyFetchedCount:
        result.media
          .fetch
          .bodyFetchedCount,
      metadataOnlyCount:
        result.media
          .fetch
          .metadataOnlyCount,
      bodySkippedCount:
        result.media
          .fetch
          .bodySkippedCount,
      rateLimitedCount:
        result.media
          .fetch
          .rateLimitedCount,
      timedOutCount:
        result.media
          .fetch
          .timedOutCount,
      retryCount:
        result.media
          .fetch
          .retryCount,
      displayOriginalComparisonCount:
        result.media
          .fetch
          .displayOriginalComparisons
          .length,
      totalFetchedBytes:
        result.media
          .fetch
          .totalFetchedBytes,
      packageTestStatus:
        result.media
          .packageTest
          ?.status
        ?? null,
      packageTestResourceCount:
        result.media
          .packageTest
          ?.resourceCount
        ?? 0,
      packageTestTotalMediaBytes:
        result.media
          .packageTest
          ?.totalMediaBytes
        ?? 0,
      packageTestLinkedOccurrenceCount:
        result.media
          .packageTest
          ?.linkedOccurrenceCount
        ?? 0,
      packageTestSkippedResourceCount:
        result.media
          .packageTest
          ?.skippedResourceCount
        ?? 0,
      packageTestAllEligibleBodyResourcesSelected:
        result.media
          .packageTest
          ?.allEligibleBodyResourcesSelected
        ?? false,
      packageTestAllSelectedCandidatesPackaged:
        result.media
          .packageTest
          ?.allSelectedCandidatesPackaged
        ?? false,
      packageTestRefetchCount:
        result.media
          .packageTest
          ?.packageRefetchCount
        ?? null,
      packageTestUsesBodyTransferMapOnly:
        result.media
          .packageTest
          ?.packageUsesBodyTransferMapOnly
        ?? null,
      packageOriginalGifResourceCount:
        result.media
          .packageTest
          ?.originalGifPackagedCount
        ?? 0,
      packageOriginalGifBytes:
        result.media
          .packageTest
          ?.originalGifPackagedBytes
        ?? 0,
      originalGifFetchCandidateCount:
        result.media
          .originalGifFetch
          ?.candidateCount
        ?? 0,
      originalGifFetchSelectedCount:
        result.media
          .originalGifFetch
          ?.selectedCount
        ?? 0,
      originalGifFetchSuccessCount:
        result.media
          .originalGifFetch
          ?.successCount
        ?? 0,
      originalGifFetchFailureCount:
        result.media
          .originalGifFetch
          ?.failureCount
        ?? 0,
      originalGifBase64DecodeFailureCount:
        result.media
          .originalGifFetch
          ?.base64DecodeFailureCount
        ?? 0,
      originalGifDecodedSizeMismatchCount:
        result.media
          .originalGifFetch
          ?.decodedSizeMismatchCount
        ?? 0,
      originalGifSignatureMismatchCount:
        result.media
          .originalGifFetch
          ?.signatureMismatchCount
        ?? 0,
      originalGifFetchTechnicalSkippedCount:
        result.media
          .originalGifFetch
          ?.technicalSkippedCount
        ?? 0,
      originalGifFetchTransferredBytes:
        result.media
          .originalGifFetch
          ?.transferredBytes
        ?? 0,
      originalGifFetchTimeBudgetExceeded:
        result.media
          .originalGifFetch
          ?.timeBudgetExceeded
        ?? false,
      originalDimensionProbeSelectedCount:
        result.media
          .originalDimensionProbe
          ?.selectedCount
        ?? 0,
      originalDimensionProbeRangeHonoredCount:
        result.media
          .originalDimensionProbe
          ?.rangeHonoredCount
        ?? 0,
      originalDimensionProbeDimensionSuccessCount:
        result.media
          .originalDimensionProbe
          ?.dimensionSuccessCount
        ?? 0,
      originalDimensionProbeBytesRead:
        result.media
          .originalDimensionProbe
          ?.bytesReadTotal
        ?? 0,
      originalDimensionProbeCandidateCount:
        result.media
          .originalDimensionProbe
          ?.candidateCount
        ?? 0,
      originalDimensionProbeBatchCount:
        result.media
          .originalDimensionProbe
          ?.batchCount
        ?? 0,
      originalDimensionProbeDurationMs:
        result.media
          .originalDimensionProbe
          ?.durationMs
        ?? 0,
      originalDimensionProbeTimedOutCount:
        result.media
          .originalDimensionProbe
          ?.timedOutCount
        ?? 0,
      originalDimensionProbeRateLimitedCount:
        result.media
          .originalDimensionProbe
          ?.rateLimitedCount
        ?? 0,
      originalDimensionProbeRateLimitEncounteredCount:
        result.media
          .originalDimensionProbe
          ?.rateLimitEncounteredCount
        ?? 0,
      originalDimensionProbeRetryRecoveredCount:
        result.media
          .originalDimensionProbe
          ?.retryRecoveredCount
        ?? 0,
      originalDimensionProbeTotalAttemptCount:
        result.media
          .originalDimensionProbe
          ?.totalAttemptCount
        ?? 0,
      originalRangeDimensionComparableCount:
        result.media
          .originalRangeDimensionComparisons
          ?.summary
          ?.dimensionComparableCount
        ?? 0,
      originalRangeSamePixelDimensionsCount:
        result.media
          .originalRangeDimensionComparisons
          ?.summary
          ?.samePixelDimensionsCount
        ?? 0,
      originalRangeOriginalMorePixelsCount:
        result.media
          .originalRangeDimensionComparisons
          ?.summary
          ?.originalMorePixelsCount
        ?? 0,
      originalPolicySelectedCount:
        result.media
          .originalPolicySelection
          ?.summary
          ?.selectedCount
        ?? 0,
      originalPolicySelectedExpectedBytes:
        result.media
          .originalPolicySelection
          ?.summary
          ?.selectedExpectedOriginalBytes
        ?? 0,
      conditionalOriginalFetchSuccessCount:
        result.media
          .conditionalOriginalFetch
          ?.successCount
        ?? 0,
      conditionalOriginalFetchFailureCount:
        result.media
          .conditionalOriginalFetch
          ?.failureCount
        ?? 0,
      conditionalOriginalFetchTransferredBytes:
        result.media
          .conditionalOriginalFetch
          ?.transferredBytes
        ?? 0,
      conditionalOriginalFetchSizeMismatchCount:
        result.media
          .conditionalOriginalFetch
          ?.sizeMismatchCount
        ?? 0,
      conditionalOriginalFetchRetryRecoveredCount:
        result.media
          .conditionalOriginalFetch
          ?.retryRecoveredCount
        ?? 0,
      packageConditionalOriginalPackagedCount:
        result.media
          .packageTest
          ?.conditionalOriginalPackagedCount
        ?? 0,
      originalImageMetadataDeferredToRangeProbe:
        result.media
          .fetch
          ?.originalImageMetadataDeferredToRangeProbe
        ?? 0,
      bodyTransferAvailableCount:
        result.media
          .fetch
          ?.bodyTransferAvailableCount
        ?? 0,
      bodyTransferBytes:
        result.media
          .fetch
          ?.bodyTransferBytes
        ?? 0
    },

    warnings:
      result.diagnostics
        .warnings.length,

    errors:
      result.diagnostics
        .errors.length,

    durationMs:
      result.extraction.durationMs
  };
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
      const index = nextIndex;
      nextIndex++;

      if (index >= items.length) {
        return;
      }

      results[index] =
        await worker(items[index], index);
    }
  }

  const workerCount =
    Math.min(
      concurrency,
      items.length
    );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => runWorker()
    )
  );

  return results;
}


function extractLinkInfo(
  link,
  textOverride = undefined
) {
  const rawHref =
    link?.getAttribute('href')
    ?? null;

  const href =
    resolveUrl(rawHref);

  const destination =
    unwrapUnsafeLink(href);

  const text =
    textOverride !== undefined
      ? textOverride
      : (
          link?.textContent.trim()
          || null
        );

  return {
    text,
    rawHref,
    href,
    externalWarning:
      link?.classList.contains('external')
      ?? false,
    wrappedByUnsafeLink:
      destination.wrapped,
    destinationUrl:
      destination.url,

    unresolvedHref:
      rawHref === null
      && href === null
      && Boolean(text),

    unresolvedEvidence:
      rawHref === null
      && href === null
      && Boolean(text)
        ? {
            tagName:
              link?.tagName ?? null,
            className:
              link?.className || null,
            attributes:
              link
                ? Array.from(
                    link.attributes
                  ).reduce(
                    (object, attribute) => {
                      object[attribute.name] =
                        attribute.value;
                      return object;
                    },
                    {}
                  )
                : {},
            htmlSnippet:
              link?.outerHTML?.slice(
                0,
                1200
              )
              ?? null
          }
        : null
  };
}

function makeUrlReference(value) {
  const href =
    resolveUrl(value);

  const destination =
    unwrapUnsafeLink(href);

  return {
    raw: value || null,
    href,
    wrappedByUnsafeLink:
      destination.wrapped,
    destinationUrl:
      destination.url
  };
}

function extractEmbeddedTargetUrl(src) {
  if (!src) {
    return null;
  }

  try {
    const url = new URL(src);

    const candidate =
      url.searchParams.get('url');

    if (!candidate) {
      return null;
    }

    return resolveUrl(
      decodeURIComponent(candidate)
    );
  }
  catch {
    return null;
  }
}

function unwrapUnsafeLink(href) {
  if (!href) {
    return {
      wrapped: false,
      url: null
    };
  }

  try {
    const url = new URL(href);

    if (
      url.hostname === 'unsafelink.com'
      || url.hostname.endsWith('.unsafelink.com')
    ) {
      const rawTarget =
        url.pathname.replace(/^\/+/, '');

      let decodedTarget =
        rawTarget;

      try {
        decodedTarget =
          decodeURIComponent(rawTarget);
      }
      catch {
        // 인코딩되지 않은 URL일 수 있으므로
        // rawTarget을 그대로 사용한다.
      }

      if (
        /^https?:\/\//i.test(
          decodedTarget
        )
      ) {
        return {
          wrapped: true,
          url: decodedTarget
        };
      }
    }
  }
  catch {
    // URL 파싱 실패 시 원래 href를 보존한다.
  }

  return {
    wrapped: false,
    url: href
  };
}

function appendCommentDiagnostics(
  comments,
  warnings
) {
  const summary =
    comments?.summary;

  if (
    !summary
    || summary.status !== 'completed'
  ) {
    return;
  }

  if (
    summary.commentCountMatches === false
  ) {
    warnings.push({
      stage: 'comments',
      code: 'COMMENT_COUNT_MISMATCH',
      displayedCommentCount:
        summary.displayedCommentCount,
      extractedCommentCount:
        summary.extractedCommentCount,
      uniqueCommentIds:
        summary.uniqueCommentIds
    });
  }

  if (
    summary.duplicateCommentIds?.length > 0
  ) {
    warnings.push({
      stage: 'comments',
      code: 'DUPLICATE_COMMENT_IDS',
      count:
        summary.duplicateCommentIds.length,
      examples:
        summary.duplicateCommentIds.slice(0, 10)
    });
  }

  if (
    summary.fetchErrors?.length > 0
  ) {
    warnings.push({
      stage: 'comments',
      code: 'COMMENT_PAGE_FETCH_ERRORS',
      count:
        summary.fetchErrors.length,
      examples:
        summary.fetchErrors.slice(0, 5)
    });
  }

  if (
    summary.relationIssueCount > 0
  ) {
    warnings.push({
      stage: 'comments',
      code: 'COMMENT_RELATION_ISSUES',
      count:
        summary.relationIssueCount,
      examples:
        summary.relationIssueExamples
    });
  }

  const missingTotal =
    (summary.missingCommentId || 0)
    + (summary.missingAuthor || 0)
    + (summary.missingCreatedAt || 0);

  if (missingTotal > 0) {
    warnings.push({
      stage: 'comments',
      code: 'COMMENT_REQUIRED_FIELDS_MISSING',
      missingCommentId:
        summary.missingCommentId,
      missingAuthor:
        summary.missingAuthor,
      missingCreatedAt:
        summary.missingCreatedAt
    });
  }

  if (
    summary.unknownContentParts > 0
  ) {
    warnings.push({
      stage: 'comments',
      code: 'UNKNOWN_COMMENT_CONTENT_PARTS',
      count:
        summary.unknownContentParts,
      examples:
        summary.unknownContentPartExamples
    });
  }
}

function resolveUrl(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(
      value,
      location.href
    ).href;
  }
  catch {
    return value;
  }
}

async function downloadJsonResult(result) {
  const channel =
    result.post.channel || 'unknown-channel';

  const postNumber =
    result.post.postNumber || 'unknown-post';

  const stamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '');

  const fileName =
    `AI_AI_${channel}_${postNumber}_${stamp}.json`;

  const text =
    JSON.stringify(
      buildAiConsumerPayload(result),
      null,
      2
    );

  const bytes =
    new TextEncoder()
      .encode(text);

  const saveResult =
    await saveGeneratedArtifact({
      bytes,
      mimeType:
        'application/json;charset=utf-8',
      fileName,
      artifactKind:
        'json-fallback'
    });

  return {
    fileName:
      saveResult.fileName
      || fileName,
    delivery: {
      artifactKind: 'json-fallback',
      save: saveResult
    }
  };
}
