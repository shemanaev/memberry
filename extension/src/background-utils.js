
export function escape(str) {
  var ret = '';
  var i;
  for (i = 0; i < str.length; i++) {
    switch (str.charAt(i)) {
    case '"':
      ret += '&quot;';
      break;
    case '\'':
      ret += '&apos;';
      break;
    case '<':
      ret += '&lt;'
      break;
    case '>':
      ret += '&gt;'
      break;
    case '&':
      ret += '&amp;'
      break;
    default:
      ret += str.charAt(i);
    }
  }
  return ret;
}

export function isValidURL(text) {
  const valid = /((https?):\/\/)?(([w|W]{3}\.)+)?[a-zA-Z0-9\-\.]{3,}\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?/
  return valid.test(text)
}

export function formatSuggestion(elem, addUrl) {
  // const MAX_URL_LEN_SHOWN = 50
  // let url = elem.url
  // if (url.length >= MAX_URL_LEN_SHOWN) {
  //     url = url.substring(0, MAX_URL_LEN_SHOWN - 1) + '…'
  // }
  const url = escape(elem.url)
  const title = escape(elem.title)

  const visited = new Date(elem.visited).toLocaleDateString(navigator.language, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  })

  let description = `<dim>${visited}</dim> :: ${title}`
  let withoutTags = `${visited} :: ${title}`

  if (addUrl) {
    // chrome doesn't show url by default
    description += ` - <url>${url}</url>`
    withoutTags += ` - ${url}`
  }

  return [description, withoutTags]
}
