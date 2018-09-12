import debugModule from 'debug'
import debounce from './debounce'
import { isValidURL, formatSuggestion } from './background-utils'

if (process.env.NODE_ENV === 'development') {
  debugModule.enable('memberry:*')
}

const debug = debugModule('memberry:background')

class Background {
  constructor() {
    this._id = 0
    this._callbacks = {}
    this._mapping = {}
    this._blacklist = []

    this._port = chrome.runtime.connectNative(NATIVE_APPLICATION_ID)
    this._port.onMessage.addListener(msg => this.onNativeMessage(msg))
    this._port.onDisconnect.addListener(() => this.onNativeDisconnect())

    chrome.omnibox.onInputEntered.addListener((text, disposition) => this.onOmniboxEntered(text, disposition))
    chrome.omnibox.onInputChanged.addListener(debounce((text, suggest) => this.onOmniboxChanged(text, suggest), 700))
    if (BROWSER === 'chrome')
      chrome.omnibox.onDeleteSuggestion.addListener((text) => this.onOmniboxDeleteSuggestion(text))

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => this.onRuntimeMessage(msg, sender, sendResponse))

    chrome.storage.onChanged.addListener((changes, area) => this.onStorageChanged(changes, area))
    chrome.storage.sync.get({
      blacklist: ''
    }, (items) => this.setBlacklist(items.blacklist))
  }

  getId() {
    this._id++
    if (this._id >= 0xffffffff) this._id = 1
    return this._id
  }

  onNativeMessage(msg) {
    debug('Received', msg)

    const cb = this._callbacks[msg.rid]

    if (cb) {
      delete this._callbacks[msg.rid]
      if (!msg.error) cb(msg.data)
    }
  }

  onNativeDisconnect() {
    // TODO: reconnects
    debug('Port disconnected', chrome.runtime.lastError)
  }

  onOmniboxChanged(text, suggest) {
    text = text.trim()

    this.query(text, 1, this.suggestionsComplete.bind(this, suggest, text))
  }

  onOmniboxEntered(text, disposition) {
    debug('onInputEntered', text)

    // TODO: add here paging navigation? like 'next', 'prev' page
    // only six results shown in omnibar, so that is bad idea.
    // separate page with results will be better
    // TODO: handle external search
    if (!isValidURL(text)) return

    switch (disposition) {
      case 'currentTab':
        chrome.tabs.update({url: text})
        break
      case 'newForegroundTab':
        chrome.tabs.create({url: text})
        break
      case 'newBackgroundTab':
        chrome.tabs.create({url: text, active: false})
        break
    }
  }

  onOmniboxDeleteSuggestion(text) {
    const url = this._mapping[text]
    debug('Delete suggestion', text, url)

    if (!url) {
      debug('No url-description mapping for', text)
      return
    }

    const message = {
      id: this.getId(),
      type: 'Remove',
      data: {
        url: url
      }
    }

    debug('delete', message)
    this._port.postMessage(message)
  }

  onStorageChanged(changes, area) {
    debug('onStorageChanged', area, changes)
    this.setBlacklist(changes.blacklist.newValue)
  }

  setBlacklist(text) {
    this._blacklist = text.split('\n')
      .map((line) => line.trim()) // normalize
      .filter((line) => line !== '')
      .filter((line) => !line.startsWith('#')) // strip comments
  }

  shouldIndex(url) {
    for (let pattern of this._blacklist) {
      const re = new RegExp(pattern, 'i')
      if (re.test(url)) {
        debug(`blacklisted by "${pattern}": ${url}`)
        return false
      }
    }
    return true
  }

  suggestionsComplete(cb, query, payload) {
    this._mapping = {}
    debug('completed', payload)

    const res = []
    for (let elem of payload.hits) {
      const [formatted, description] = formatSuggestion(elem, BROWSER === 'chrome')
      this._mapping[description] = elem.url
      res.push({
        content: elem.url,
        description: BROWSER === 'chrome' ? formatted : description,
        deletable: true
      })
    }

    if (payload.total > 5) {
      const suggQuery = BROWSER === 'chrome' ? `<match>${query}</match>` : query
      chrome.omnibox.setDefaultSuggestion({
        description: chrome.i18n.getMessage("search_external", suggQuery)
      })
    } else if (payload.total > 0) {
      chrome.omnibox.setDefaultSuggestion({
        description: chrome.i18n.getMessage("select_result")
      })
    } else {
      chrome.omnibox.setDefaultSuggestion({
        description: chrome.i18n.getMessage("no_results")
      })
    }

    cb(res)
  }

  onRuntimeMessage(msg, sender, sendResponse) {
    if (msg.command === 'index') {
      return this.indexCommad(msg)
    } else if (msg.command === 'check') {
      return this.checkCommand(msg, sendResponse)
    }
  }

  indexCommad(msg) {
    if (!this.shouldIndex(msg.data.url)) return false
    debug('index', msg)

    const message = {
      id: this.getId(),
      type: 'Add',
      data: {
        url: msg.data.url,
        lang: msg.data.lang,
        last_modified: msg.data.lastModified,
        title: msg.data.title,
        contents: msg.data.contents
      }
    }

    debug('index msg', message)
    this._port.postMessage(message)
    return false
  }

  checkCommand(msg, sendResponse) {
    const urlBlacklisted = !this.shouldIndex(msg.url)

    if (urlBlacklisted) {
      debug('check url blacklisted', msg.url)

      sendResponse({
        blacklisted: urlBlacklisted
      })
      return false
    }

    const id = this.getId()
    this._callbacks[id] = sendResponse
    const message = {
      id: id,
      type: 'Check',
      data: {
        url: msg.url
      }
    }

    debug('check msg', message)

    this._port.postMessage(message)
    return true
  }

  query(q, page, cb) {
    if (q === '') {
      debug('Query is empty')
      return
    }

    page = page || 1
    const id = this.getId()
    this._callbacks[id] = cb

    const message = {
      id: id,
      type: 'Search',
      data: {
        query: q,
        page: page,
        hits_per_page: 6,
      }
    }

    debug('query msg', message)

    this._port.postMessage(message)
  }
}

const bg = new Background()
debug('Script started')
