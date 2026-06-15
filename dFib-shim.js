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

  var STUB_PREFIX = '[dFib-shim]'

  function stubLog(method) {
    if (typeof console !== 'undefined') {
      console.warn(STUB_PREFIX, method, 'is not available in browser mode' + (arguments.length > 1 ? ' — called with: ' + JSON.stringify(Array.prototype.slice.call(arguments, 1)) : ''))
    }
  }

  /** Read the SPA's injected session token. */
  function getSessionToken() {
    return typeof window.__HERMES_SESSION_TOKEN__ !== 'undefined'
      ? window.__HERMES_SESSION_TOKEN__
      : ''
  }

  /** Read the SPA's base path (empty or /prefix). */
  function getBasePath() {
    return window.__HERMES_BASE_PATH__ || ''
  }

  /** Build the gateway WebSocket URL with auth token. */
  function gatewayWsUrl() {
    var base = getBasePath()
    var token = getSessionToken()
    var wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    var host = window.location.host
    return wsProto + '//' + host + base + '/api/ws?token=' + encodeURIComponent(token)
  }

  function apiUrl(path) {
    var base = getBasePath()
    return base + path
  }

  if (typeof window.hermesDesktop === 'undefined' || window.hermesDesktop === null) {
    // ── Mobile / responsive CSS fixes ──────────────────────────
    ;(function () {
      // Fix 100vh → 100dvh on ALL devices (prevents bottom cut-off on mobile)
      var style = document.createElement('style')
      style.textContent = [
        // Override h-screen/min-h-screen globally
        '[class*="h-screen"], [class*="min-h-screen"], html, body {',
        '  min-height: 100dvh !important;',
        '  height: 100dvh !important;',
        '  max-height: 100dvh !important;',
        '}',
        // Prevent scrolling at the root level
        'html, body, #root {',
        '  overflow: hidden !important;',
        '}',
        // Force main layout to fill viewport
        '[class*="sidebar-wrapper"],',
        '[class*="flex"][class*="h-screen"],',
        '[class*="flex"][class*="min-h-screen"] {',
        '  max-height: 100dvh !important;',
        '  min-height: 0 !important;',
        '}',
        // Mobile-specific overrides
        '@media (max-width: 768px) {',
        // Push sectionfooter to bottom
        '  [class*="sectionfooter"] {',
        '    margin-top: auto !important;',
        '  }',
        // Ensure content area scrolls, not the page
        '  main, [role="main"], [class*="flex-1"] {',
        '    overflow-y: auto !important;',
        '    -webkit-overflow-scrolling: touch !important;',
        '  }',
        // Sidebar overlay on mobile
        '  [data-slot="sidebar-wrapper"] {',
        '    position: relative !important;',
        '    overflow: hidden !important;',
        '  }',
        // Right sidebar on mobile: overlay
        '  [role="complementary"] {',
        '    position: fixed !important;',
        '    right: 0 !important;',
        '    top: 0 !important;',
        '    bottom: 0 !important;',
        '    z-index: 50 !important;',
        '    background: var(--color-background, #111) !important;',
        '    box-shadow: -4px 0 12px rgba(0,0,0,0.3) !important;',
        '    transition: transform 0.2s ease !important;',
        '  }',
        // Left sidebar content on mobile: overlay
        '  [data-slot="sidebar-wrapper"] > div:first-child {',
        '    position: fixed !important;',
        '    left: 0 !important;',
        '    top: 0 !important;',
        '    bottom: 0 !important;',
        '    z-index: 50 !important;',
        '    background: var(--color-background, #111) !important;',
        '    box-shadow: 4px 0 12px rgba(0,0,0,0.3) !important;',
        '    transition: transform 0.2s ease !important;',
        '  }',
        '}'
      ].join('\n')
      document.head.appendChild(style)

      // ── Dynamic viewport height fix ──────────────────────────
      function fixViewport() {
        var vh = window.innerHeight
        document.documentElement.style.setProperty('--vh', vh + 'px')
        // Force 100dvh on all h-screen elements by setting a CSS variable
        document.documentElement.style.setProperty('--real-vh', vh + 'px')
      }
      fixViewport()
      window.addEventListener('resize', fixViewport)
      window.addEventListener('orientationchange', function () {
        setTimeout(fixViewport, 300)
      })

      // ── Sidebar toggle patch (works on mobile Firefox) ──────
      function patchSidebarToggles() {
        var wrapper = document.querySelector('[data-slot="sidebar-wrapper"]')
        if (!wrapper) return

        function handleToggle(label) {
          if (label.indexOf('show sidebar') >= 0 || label.indexOf('hide sidebar') >= 0) {
            var open = label.indexOf('show') >= 0
            var sidebar = wrapper.querySelector('> div:first-child')
            if (sidebar) {
              sidebar.style.transform = open ? 'translateX(0)' : 'translateX(-100%)'
              // Also tell internal React via data attribute
              wrapper.setAttribute('data-sidebar-visible', String(open))
            }
          }
          if (label.indexOf('show right') >= 0 || label.indexOf('hide right') >= 0) {
            var open = label.indexOf('show') >= 0
            var rightPanel = document.querySelector('[role="complementary"]')
            if (rightPanel) {
              rightPanel.style.transform = open ? 'translateX(0)' : 'translateX(100%)'
              rightPanel.style.display = '' // let transform handle it
            }
          }
        }

        // Listen for both click and touchstart
        document.addEventListener('click', function (e) {
          var btn = e.target.closest('button')
          if (btn) handleToggle((btn.getAttribute('aria-label') || '').toLowerCase())
        }, true)

        document.addEventListener('touchstart', function (e) {
          var btn = e.target.closest('button')
          if (btn) handleToggle((btn.getAttribute('aria-label') || '').toLowerCase())
        }, true)

        // Set initial transforms (sidebar hidden on mobile)
        var sidebar = wrapper.querySelector('> div:first-child')
        if (sidebar) sidebar.style.transform = 'translateX(-100%)'
        var rightPanel = document.querySelector('[role="complementary"]')
        if (rightPanel) rightPanel.style.transform = 'translateX(100%)'
      }

      // Try multiple times to catch the SPA render
      patchSidebarToggles()
      setTimeout(patchSidebarToggles, 500)
      setTimeout(patchSidebarToggles, 1500)
      setTimeout(patchSidebarToggles, 3000)

      // Also observe the DOM for when sidebar-wrapper appears
      var observer = new MutationObserver(function () {
        patchSidebarToggles()
        observer.disconnect()
      })
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true })
      setTimeout(function () { observer.disconnect() }, 5000) // safety timeout
    })()

    window.hermesDesktop = {
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
          baseUrl: window.location.origin,
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
        return Promise.resolve({ ok: true, rebuilt: false })
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
        var path = opts.path || '/'
        var method = (opts.method || 'GET').toUpperCase()
        var body = opts.body
        var profile = opts.profile
        var baseUrl = getBasePath()
        var fullUrl = baseUrl + path
        var headers = { 'Accept': 'application/json' }
        var fetchOpts = { method: method, headers: headers }

        // Inject session token as Bearer auth (what web_server.py expects)
        var token = getSessionToken()
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
          var ct = (resp.headers.get('content-type') || '')
          if (ct.indexOf('application/json') >= 0) {
            return resp.json().then(function (data) {
              if (!resp.ok) {
                var err = new Error(data.detail || data.message || 'API error')
                err.status = resp.status
                throw err
              }
              return data
            })
          }
          if (!resp.ok) {
            var err2 = new Error('API error: ' + resp.status)
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

      watchPreviewFile: function (filePath, callback) {
        stubLog('watchPreviewFile', filePath)
        return function () { /* noop unsubscribe */ }
      },

      onPreviewFileChanged: function (callback) {
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
          try { window.open(url, '_blank') } catch (e) { /* noop */ }
        }
      },

      openSessionWindow: function () {
        stubLog('openSessionWindow')
        return Promise.resolve({ success: true })
      },

      writeClipboard: function (text) {
        stubLog('writeClipboard', text)
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          try { navigator.clipboard.writeText(text || '') } catch (e) { /* noop */ }
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

      saveImageBuffer: function (buffer) {
        stubLog('saveImageBuffer')
        return Promise.resolve(null)
      },

      platform: 'web'
    }
  }
})()
