import debugModule from 'debug'
import Readability from 'readability'
import findLastModified from './last-modified'

if (process.env.NODE_ENV === 'development') {
  debugModule.enable('memberry:*')
}

const debug = debugModule('memberry:content')

function getUrl() {
  return window.location.href.split('#')[0]
}

// TODO: maybe there is better way to workaround pjax navigation and html5 history stuff
// affected: medium.com
function urlTimeout(url) {
  const newUrl = getUrl()
  if (newUrl !== url) {
    url = newUrl
    tryIndex()
  }
  setTimeout(urlTimeout.bind(null, url), 5000)
}

function windowLoaded() {
  debug('windowLoaded')
  tryIndex()

  const url = getUrl()
  setTimeout(urlTimeout.bind(null, url), 3000)
}
windowLoaded()

function windowPopstate(e) {
  debug('windowPopstate')
  setTimeout(tryIndex, 3000)
}
window.addEventListener('popstate', windowPopstate)

function tryIndex() {
  const url = getUrl()

  chrome.runtime.sendMessage({
    command: 'check',
    url: url
  }, needIndex.bind(null, url))
}

function needIndex(url, response) {
  if (response.blacklisted) return

  const lastModified = findLastModified()
  debug('got Last-Modified', lastModified, response.last_modified)

  const lm1 = Math.floor(lastModified.getTime() / 1000)
  const lm2 = Math.floor(new Date(response.last_modified).getTime() / 1000)

  if (lm1 <= lm2) return

  debug('indexing cause previous too old', lm1, lm2)
  const documentClone = document.cloneNode(true)
  const article = new Readability(documentClone).parse()

  chrome.runtime.sendMessage({
    command: 'index',
    data: {
      url: url,
      lang: document.documentElement.lang,
      lastModified: lastModified.toISOString(),
      title: article.title,
      contents: article.textContent
    }
  })
}


// const pushStateOriginal = window.history.pushState
// window.history.pushState = function (state) {
//   debug('pushState')
//   setTimeout(tryIndex, 3000)
//   return pushStateOriginal.apply(history, arguments)
// }

// const replaceStateOriginal = window.history.replaceState
// window.history.replaceState = function (state) {
//   debug('replaceState')
//   setTimeout(tryIndex, 3000)
//   return replaceStateOriginal.apply(history, arguments)
// }
