
function save_options() {
  const blacklist = document.getElementById('blacklist').value

  chrome.storage.sync.set({
    blacklist: blacklist,
  }, () => {
    const status = document.getElementById('status')
    status.textContent = 'Options saved.'
    setTimeout(function() {
      status.textContent = ''
    }, 1750)
  })
}

function restore_options() {
  chrome.storage.sync.get({
    blacklist: ''
  }, (items) => {
    const blacklist = document.getElementById('blacklist')
    blacklist.value = items.blacklist
  })
}

document.addEventListener('DOMContentLoaded', restore_options)
document.getElementById('save').addEventListener('click', save_options)
