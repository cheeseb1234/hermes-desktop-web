/**
 * dFib-shim.js — Desktop-in-browser shim
 *
 * When the Hermes Desktop SPA runs inside a web browser (served by the
 * dashboard's web_server.py at /), Electron APIs (window.hermesDesktop)
 * are unavailable. This shim provides browser-compatible stubs so the
 * SPA boots, renders, and connects to the dashboard's own WebSocket
 * gateway endpoint.
 *
 * Injected via vite.config.web.ts (htmlPlugin + copyFileSync).
 */
(function () {
  'use strict'

  let STUB_PREFIX = '[dFib-shim]'

  function stubLog(method) {
    if (typeof console !== 'undefined') {
      console.warn(STUB_PREFIX, method, 'is not available in browser mode' + (arguments.length > 1 ? ' — called with: ' + JSON.stringify(Array.prototype.slice.call(arguments, 1)) : ''))
    }
  }

  /** Read the SPA's injected session token. */
  function getSessionToken() {
    return typeof globalThis.__HERMES_SESSION_TOKEN__ !== 'undefined'
      ? globalThis.__HERMES_SESSION_TOKEN__
      : ''
  }

  /** Read the SPA's base path (empty or /prefix). */
  function getBasePath() {
    return globalThis.__HERMES_BASE_PATH__ || ''
  }

  /** Build the gateway WebSocket URL with auth token. */
  function gatewayWsUrl() {
    let base = getBasePath()
    let token = getSessionToken()
    let wsProto = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:'
    let host = globalThis.location.host
    return wsProto + '//' + host + base + '/api/ws?token=' + encodeURIComponent(token)
  }

  if (typeof globalThis.hermesDesktop === 'undefined' || globalThis.hermesDesktop === null) {
    // ── Viewport height fix for mobile ────────────────────────
    // The SPA uses h-screen (100vh). On mobile the browser chrome
    // (address bar, toolbar) makes 100vh extend past the visible area.
    // We inject a style that overrides with 100dvh and listen for
    // resize/orientation changes to keep it accurate.
    ;(function () {
      let vz = document.createElement('style')
      vz.textContent = [
        // Fix 100vh → 100dvh for mobile browser chrome
        '[class*="h-screen"], [class*="min-h-screen"], html, body {',
        '  height: 100dvh !important;',
        '  min-height: 100dvh !important;',
        '  max-height: 100dvh !important;',
        '}',
        // ── Mobile sidebar overlay ─────────────────────────────
        // The app uses shadcn Sidebar with collapsible="none" — no Sheet.
        // On desktop the sidebar is an inline flex div in the PaneShell track.
        // On mobile (<768px) PaneShell enters "hover-reveal" mode: sidebar is
        // wrapped in a container with overflow-hidden + translateX transform.
        //
        // Instead of fighting CSS containing-block issues with position:fixed,
        // we hijack the PaneShell's built-in hover-reveal mechanism: adding
        // data-forced="" to the pane root triggers the native slide-in CSS
        // (group-data-[forced]/reveal:translate-x-0) — smooth, zero-conflict.
        '@media (max-width: 767px) {',
        // Backdrop overlay
        '  .dfib-backdrop {',
        '    position: fixed; inset: 0; z-index: 89;',
        '    background: rgba(0, 0, 0, 0.5);',
        '    opacity: 0; pointer-events: none;',
        '    transition: opacity 0.2s ease;',
        '  }',
        '  .dfib-backdrop.dfib-visible {',
        '    opacity: 1; pointer-events: auto;',
        '  }',
        // Ensure hover-reveal panels render above backdrop
        '  [data-pane-hover-reveal] [data-forced] .z-30,',
        '  [data-pane-hover-reveal][data-forced] > .absolute.overflow-hidden {',
        '    z-index: 90 !important;',
        '  }',
        '}'.join('\n')
      ].join('\n')
      document.head.appendChild(vz)

      function fixV() {
        let h = globalThis.innerHeight
        document.documentElement.style.setProperty('--vh', h + 'px')
        document.documentElement.style.setProperty('--real-vh', h + 'px')
      }
      fixV()
      globalThis.addEventListener('resize', fixV)
      globalThis.addEventListener('orientationchange', function () { setTimeout(fixV, 300) })
    })()
    // ── Mobile sidebar interactivity ──────────────────────────
    // NOTE: This script runs from <head> before <body> exists. All DOM
    // access deferred in init().
    ;(function () {
      let MOBILE_BP = 768
      function isMobile() { return globalThis.innerWidth < MOBILE_BP }

      let backdrop

      function getPane(id) {
        return document.querySelector('[data-pane-id="' + id + '"]')
      }

      function isForced(pane) {
        return pane && pane.hasAttribute('data-forced')
      }

      function setForced(pane, forced) {
        if (!pane) return
        if (forced) pane.setAttribute('data-forced', '')
        else pane.removeAttribute('data-forced')
      }

      function closeAll() {
        setForced(getPane('chat-sidebar'), false)
        setForced(getPane('file-browser'), false)
        if (backdrop) backdrop.classList.remove('dfib-visible')
      }

      function onLeftToggle(e) {
        e.stopPropagation()
        e.preventDefault()
        if (!isMobile()) return
        let pane = getPane('chat-sidebar')
        if (isForced(pane)) { closeAll() }
        else {
          setForced(getPane('file-browser'), false)  // close other first
          setForced(pane, true)
          if (backdrop) backdrop.classList.add('dfib-visible')
        }
      }

      function onRightToggle(e) {
        e.stopPropagation()
        e.preventDefault()
        if (!isMobile()) return
        let pane = getPane('file-browser')
        if (isForced(pane)) { closeAll() }
        else {
          setForced(getPane('chat-sidebar'), false)  // close other first
          setForced(pane, true)
          if (backdrop) backdrop.classList.add('dfib-visible')
        }
      }

      function init() {
        backdrop = document.createElement('div')
        backdrop.className = 'dfib-backdrop'
        backdrop.addEventListener('click', closeAll)
        document.body.appendChild(backdrop)

        function patchButtons() {
          let lb = document.querySelector('.codicon-layout-sidebar-left')
          let rb = document.querySelector('.codicon-layout-sidebar-right')
          if (lb) { let lbtn = lb.closest('button'); if (lbtn && !lbtn._dfib) { lbtn.addEventListener('click', onLeftToggle, true); lbtn._dfib = true } }
          if (rb) { let rbtn = rb.closest('button'); if (rbtn && !rbtn._dfib) { rbtn.addEventListener('click', onRightToggle, true); rbtn._dfib = true } }
        }

        patchButtons()
        let obs = new MutationObserver(patchButtons)
        obs.observe(document.body, { childList: true, subtree: true })
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
      } else {
        init()
      }

      globalThis.addEventListener('resize', function () {
        if (!isMobile()) closeAll()
      })
    })()

    globalThis.hermesDesktop = {
      // ── Bootstrap ────────────────────────────────────────────
      getBootstrapState: function () {
        stubLog('getBootstrapState')
        // Must return full bootstrap state shape, not just metadata.
        // The Qge component uses the result to REPLACE React state.
        // Missing fields (log, manifest, stages) cause .length crashes.
        return Promise.resolve({
          active: false,
          manifest: null,
          stages: {},
          error: null,
          log: [],
          startedAt: null,
          completedAt: null,
          unsupportedPlatform: null,
          platform: 'web',
          version: '0.0.0'
        })
      },

      onBootstrapEvent: function () {
        stubLog('onBootstrapEvent')
        return function () { /* noop */ }
      },

      getBootProgress: function () {
        stubLog('getBootProgress')
        return Promise.resolve({ message: 'Ready', progress: 100, phase: 'renderer.ready', running: false, timestamp: Date.now(), error: null })
      },

      onBootProgress: function () {
        stubLog('onBootProgress')
        return function () { /* noop */ }
      },

      resetBootstrap: function () {
        stubLog('resetBootstrap')
        return Promise.resolve()
      },

      repairBootstrap: function () {
        stubLog('repairBootstrap')
        return Promise.resolve()
      },

      // ── Connection ───────────────────────────────────────────
      getConnection: function (profile) {
        stubLog('getConnection', profile)
        return Promise.resolve({
          baseUrl: globalThis.location.origin,
          isFullscreen: false,
          mode: 'local',
          authMode: 'token',
          nativeOverlayWidth: 0,
          source: 'env',
          token: getSessionToken(),
          wsUrl: gatewayWsUrl(),
          logs: [],
          windowButtonPosition: null
        })
      },

      revalidateConnection: function () {
        stubLog('revalidateConnection')
        return Promise.resolve({ ok: true, rebuilt: true })
      },

      touchBackend: function (profile) {
        stubLog('touchBackend', profile)
        return Promise.resolve({ ok: true })
      },

      getGatewayWsUrl: function (profile) {
        stubLog('getGatewayWsUrl', profile)
        return Promise.resolve(gatewayWsUrl())
      },

      getConnectionConfig: function (profile) {
        stubLog('getConnectionConfig', profile)
        return Promise.resolve({
          envOverride: false,
          mode: 'local',
          profile: profile || null,
          remoteAuthMode: 'token',
          remoteOauthConnected: false,
          remoteTokenPreview: null,
          remoteTokenSet: false,
          remoteUrl: ''
        })
      },

      saveConnectionConfig: function (payload) {
        stubLog('saveConnectionConfig', payload)
        if (payload && payload.mode === 'local') {
          return Promise.resolve({
            envOverride: false,
            mode: 'local',
            saved: true
          })
        }
        return Promise.reject(new Error('Remote gateway not supported in browser mode'))
      },

      probeConnectionConfig: function () {
        stubLog('probeConnectionConfig')
        return Promise.resolve({ providers: [] })
      },

      oauthLoginConnectionConfig: function () {
        stubLog('oauthLoginConnectionConfig')
        return Promise.resolve({ connected: false })
      },

      oauthLogoutConnectionConfig: function () {
        stubLog('oauthLogoutConnectionConfig')
        return Promise.resolve({ ok: true })
      },

      applyConnectionConfig: function (payload) {
        stubLog('applyConnectionConfig', payload)
        return Promise.resolve({ ok: true })
      },

      testConnectionConfig: function () {
        stubLog('testConnectionConfig')
        return Promise.resolve({ ok: true, latencyMs: 0 })
      },

      // ── API client (wraps fetch for the dashboard's REST endpoints) ─
      api: function (opts) {
        if (!opts || typeof opts !== 'object') return Promise.reject(new Error('api() requires an options object'))
        let path = opts.path || '/'
        let method = (opts.method || 'GET').toUpperCase()
        let body = opts.body
        let baseUrl = getBasePath()
        let fullUrl = baseUrl + path
        let headers = { 'Accept': 'application/json' }
        let fetchOpts = { method: method, headers: headers }

        // Inject session token as Bearer auth (what web_server.py expects)
        let token = getSessionToken()
        if (token) { headers['Authorization'] = 'Bearer ' + token }

        // Add body for non-GET
        if (body && method !== 'GET') {
          if (typeof body === 'object') {
            headers['Content-Type'] = 'application/json'
            fetchOpts.body = JSON.stringify(body)
          } else {
            fetchOpts.body = body
          }
        }

        return fetch(fullUrl, fetchOpts).then(function (resp) {
          let ct = (resp.headers.get('content-type') || '')
          if (ct.indexOf('application/json') >= 0) {
            return resp.json().then(function (data) {
              if (!resp.ok) {
                let err = new Error(data.detail || data.message || 'API error')
                err.status = resp.status
                throw err
              }
              return data
            })
          }
          if (!resp.ok) {
            let err2 = new Error('API error: ' + resp.status)
            err2.status = resp.status
            throw err2
          }
          return resp.text().then(function (t) { return { text: t } })
        })
      },

      // ── File I/O ─────────────────────────────────────────────
      getPathForFile: function (filePath) {
        stubLog('getPathForFile', filePath)
        return Promise.resolve(getBasePath() + '/' + (filePath || ''))
      },

      readFileDataUrl: function (filePath) {
        stubLog('readFileDataUrl', filePath)
        return Promise.resolve(null)
      },

      saveImageFromUrl: function (url) {
        stubLog('saveImageFromUrl', url)
        return Promise.resolve({ localPath: null })
      },

      watchPreviewFile: function (filePath, _callback) {
        stubLog('watchPreviewFile', filePath)
        return function () { /* noop unsubscribe */ }
      },

      onPreviewFileChanged: function (_callback) {
        stubLog('onPreviewFileChanged')
        return function () { /* noop unsubscribe */ }
      },

      stopPreviewFileWatch: function () {
        stubLog('stopPreviewFileWatch')
      },

      // ── Notifications ─────────────────────────────────────────
      notify: function (opts) {
        stubLog('notify', opts)
      },

      onNotificationAction: function () {
        stubLog('onNotificationAction')
        return function () { /* noop */ }
      },

      // ── External actions ─────────────────────────────────────
      openExternal: function (url) {
        stubLog('openExternal', url)
        if (url && typeof url === 'string') {
          try { globalThis.open(url, '_blank') } catch (_e) { /* noop */ }
        }
      },

      openSessionWindow: function () {
        stubLog('openSessionWindow')
        return Promise.resolve({ success: true })
      },

      writeClipboard: function (text) {
        stubLog('writeClipboard', text)
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          try { navigator.clipboard.writeText(text || '') } catch (_e) { /* noop */ }
        }
      },

      // ── App lifecycle ────────────────────────────────────────
      hide: function () { stubLog('hide') },
      show: function () { stubLog('show') },
      minimize: function () { stubLog('minimize') },
      maximize: function () { stubLog('maximize') },
      close: function () { stubLog('close') },
      isFullScreen: function () { stubLog('isFullScreen'); return Promise.resolve(false) },
      setFullScreen: function () { stubLog('setFullScreen') },

      onDeepLink: function () {
        stubLog('onDeepLink')
        return function () { /* noop */ }
      },

      onWindowStateChanged: function () {
        stubLog('onWindowStateChanged')
        return function () { /* noop */ }
      },

      onBackendExit: function () {
        stubLog('onBackendExit')
        return function () { /* noop */ }
      },

      // ── Update hooks ─────────────────────────────────────────
      updates: {
        onProgress: function () {
          stubLog('updates.onProgress')
          return function () { /* noop */ }
        }
      },

      // ── Logging / debug ──────────────────────────────────────
      getRecentLogs: function () {
        stubLog('getRecentLogs')
        return Promise.resolve({ lines: [] })
      },

      revealLogs: function () {
        stubLog('revealLogs')
        return Promise.resolve()
      },

      // ── Environment ──────────────────────────────────────────
      getEnv: function () {
        stubLog('getEnv')
        return Promise.resolve({})
      },
      // ── Version ──────────────────────────────────────────────
      getVersion: function () {
        stubLog('getVersion')
        return Promise.resolve('0.16.0')
      },

      // ── Bootstrap helpers ─────────────────────────────────────
      cancelBootstrap: function () {
        stubLog('cancelBootstrap')
        return Promise.resolve()
      },

      fetchLinkTitle: function (url) {
        stubLog('fetchLinkTitle', url)
        return Promise.resolve(null)
      },

      // ── Theme / window ────────────────────────────────────────
      setNativeTheme: function (opts) {
        stubLog('setNativeTheme', opts)
      },

      setTitleBarTheme: function (opts) {
        stubLog('setTitleBarTheme', opts)
      },

      setTranslucency: function () {
        stubLog('setTranslucency')
      },

      signalDeepLinkReady: function () {
        stubLog('signalDeepLinkReady')
      },

      // ── Preview / workspace ───────────────────────────────────
      setPreviewShortcutActive: function (active) {
        stubLog('setPreviewShortcutActive', active)
      },

      onClosePreviewRequested: function () {
        stubLog('onClosePreviewRequested')
        return function () { /* noop */ }
      },

      normalizePreviewTarget: function (target) {
        stubLog('normalizePreviewTarget', target)
        return target || null
      },

      sanitizeWorkspaceCwd: function (cwd) {
        stubLog('sanitizeWorkspaceCwd', cwd)
        return cwd || ''
      },

      // ── File dialogs ──────────────────────────────────────────
      selectPaths: function (opts) {
        stubLog('selectPaths', opts)
        return Promise.resolve([])
      },

      // ── Session ───────────────────────────────────────────────
      onFocusSession: function () {
        stubLog('onFocusSession')
        return function () { /* noop */ }
      },

      onOpenUpdatesRequested: function () {
        stubLog('onOpenUpdatesRequested')
        return function () { /* noop */ }
      },

      // ── Native features ───────────────────────────────────────
      requestMicrophoneAccess: function () {
        stubLog('requestMicrophoneAccess')
        return Promise.resolve(false)
      },

      uninstall: function () {
        stubLog('uninstall')
      },

      // ── Clipboard helpers ─────────────────────────────────────
      saveClipboardImage: function () {
        stubLog('saveClipboardImage')
        return Promise.resolve(null)
      },

      saveImageBuffer: function (_buffer) {
        stubLog('saveImageBuffer')
        return Promise.resolve(null)
      },

      platform: 'web'
    }
  }
})()
