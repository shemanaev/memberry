import debugModule from 'debug'
const debug = debugModule('memberry:last-modified')

export default function findLastModified() {
  // check for JSON-LD
  debug('Last-Modified: JSON-LD')
  const jsonld = document.querySelector('script[type="application/ld+json"]')
  if (jsonld) {
    const ld = JSON.parse(jsonld.innerText)

    debug('dateModified')
    if (ld.hasOwnProperty('dateModified'))
      return new Date(ld.dateModified)

    debug('datePublished')
    if (ld.hasOwnProperty('datePublished'))
      return new Date(ld.datePublished)

    debug('dateCreated')
    if (ld.hasOwnProperty('dateCreated'))
      return new Date(ld.dateCreated)
  }

  // check in meta tags
  debug('Last-Modified: meta')
  const pubmeta = document.querySelector('meta[property="article:published_time"]')
  if (pubmeta) {
    return new Date(pubmeta.content)
  }

  // microdata
  debug('Last-Modified: Microdata')
  const micro = document.querySelector('[itemscope] [itemprop="dateModified"]') ||
                document.querySelector('[itemscope] [itemprop="datePublished"]') ||
                document.querySelector('[itemscope] [itemprop="dateCreated"]')
  if (micro) {
    debug('content')
    if (micro.content)
      return new Date(micro.content)

    debug('dateTime')
    let dateTimeAttr = micro.dateTime || micro.getAttribute('datetime')
    if (dateTimeAttr)
      return new Date(dateTimeAttr)

    debug('dt.datetime')
    const dt = micro.querySelector('[datetime]')
    if (dt)
      return new Date(dt.dateTime || dt.getAttribute('datetime'))
  }

  // fallback to Last-Modified. it's unreliable as hell
  debug('Last-Modified: http')
  return new Date(document.lastModified)
}
