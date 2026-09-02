(function () {
  const bootEl = document.getElementById('boot')
  const loginView = document.getElementById('login-view')
  const adminView = document.getElementById('admin-view')
  const loginForm = document.getElementById('login-form')
  const loginError = document.getElementById('login-error')
  const loginButton = document.getElementById('login-button')
  const logoutButton = document.getElementById('logout-button')
  const searchInput = document.getElementById('search')
  const statusSelect = document.getElementById('status')
  const sortSelect = document.getElementById('sort')
  const resultsCount = document.getElementById('results-count')
  const pageLabel = document.getElementById('page-label')
  const prevPage = document.getElementById('prev-page')
  const nextPage = document.getElementById('next-page')
  const listError = document.getElementById('list-error')
  const listingsEl = document.getElementById('listings')

  const PAGE_SIZE = 50
  let currentPage = 1
  let searchTimer = null

  function showLogin() {
    bootEl.hidden = true
    adminView.hidden = true
    loginView.hidden = false
  }

  function showAdmin() {
    bootEl.hidden = true
    loginView.hidden = true
    adminView.hidden = false
  }

  function setLoginError(message) {
    if (!message) {
      loginError.hidden = true
      loginError.textContent = ''
      return
    }
    loginError.hidden = false
    loginError.textContent = message
  }

  function setListError(message) {
    if (!message) {
      listError.hidden = true
      listError.textContent = ''
      return
    }
    listError.hidden = false
    listError.textContent = message
  }

  async function api(url, options) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options
    })
    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }
    return { response, data }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function formatDate(value) {
    if (!value) {
      return ''
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ''
    }
    return date.toLocaleString()
  }

  function firstImageUrl(imageUrls) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return ''
    }
    const first = imageUrls[0]
    return typeof first === 'string' ? first : ''
  }

  function publicListingHref(listing) {
    if (listing.public_path && listing.public_path.indexOf('/l/') === 0) {
      return listing.public_path
    }
    return ''
  }

  function renderListings(payload) {
    const listings = Array.isArray(payload.listings) ? payload.listings : []
    const total = typeof payload.total === 'number' ? payload.total : listings.length
    const page = payload.page || 1
    const limit = payload.limit || PAGE_SIZE
    const pageCount = Math.max(1, Math.ceil(total / limit))

    resultsCount.textContent = total === 1 ? '1 listing' : total + ' listings'
    pageLabel.textContent = 'Page ' + page + ' of ' + pageCount
    prevPage.disabled = page <= 1
    nextPage.disabled = page >= pageCount

    if (listings.length === 0) {
      listingsEl.innerHTML = '<div class="empty">No listings match these filters.</div>'
      return
    }

    listingsEl.innerHTML = listings.map(function (listing) {
      const imageUrl = firstImageUrl(listing.image_urls)
      const thumb = imageUrl
        ? '<img class="thumb" src="' + escapeHtml(imageUrl) + '" alt="" />'
        : '<div class="thumb-placeholder">No image</div>'
      const status = String(listing.status || '').toLowerCase()
      const statusClass = status === 'sold' ? 'sold' : 'active'
      const statusLabel = status === 'sold' ? 'Sold' : 'Active'
      const soldLine = status === 'sold' && listing.sold_at
        ? '<p class="listing-meta">Sold ' + escapeHtml(formatDate(listing.sold_at)) + '</p>'
        : ''
      const href = publicListingHref(listing)
      const openLink = href
        ? '<a class="open-link" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">Open Public Listing</a>'
        : ''

      return (
        '<article class="listing-row">' +
          thumb +
          '<div>' +
            '<h2 class="listing-title">' + escapeHtml(listing.title || 'Untitled listing') + '</h2>' +
            '<p class="listing-meta">' + escapeHtml(listing.price || 'No price') +
              (listing.location ? ' · ' + escapeHtml(listing.location) : '') +
            '</p>' +
            '<p class="listing-meta">' + escapeHtml(listing.contact_email || 'No email') + '</p>' +
            '<p class="listing-id">' + escapeHtml(listing.id || '') + '</p>' +
          '</div>' +
          '<div class="listing-side">' +
            '<span class="status-badge ' + statusClass + '">' + statusLabel + '</span>' +
            '<p class="listing-meta">Created ' + escapeHtml(formatDate(listing.created_at) || 'unknown') + '</p>' +
            soldLine +
          '</div>' +
          '<div class="listing-actions">' +
            openLink +
          '</div>' +
        '</article>'
      )
    }).join('')
  }

  async function loadListings() {
    setListError('')
    const params = new URLSearchParams({
      status: statusSelect.value || 'all',
      sort: sortSelect.value || 'newest',
      q: searchInput.value.trim(),
      page: String(currentPage),
      limit: String(PAGE_SIZE)
    })

    const { response, data } = await api('/api/dbs-console/listings?' + params.toString())

    if (response.status === 401) {
      showLogin()
      return
    }

    if (!response.ok || !data || data.ok !== true) {
      setListError('Could not load listings. Try again.')
      listingsEl.innerHTML = ''
      resultsCount.textContent = 'Listings unavailable'
      pageLabel.textContent = ''
      prevPage.disabled = true
      nextPage.disabled = true
      return
    }

    renderListings(data)
  }

  async function checkSession() {
    try {
      const { response, data } = await api('/api/dbs-console/session')
      if (response.ok && data && data.authenticated === true) {
        showAdmin()
        await loadListings()
        return
      }
    } catch {
      setLoginError('Could not reach the server.')
    }
    showLogin()
  }

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault()
    setLoginError('')
    loginButton.disabled = true

    try {
      const { response, data } = await api('/api/dbs-console/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        })
      })

      if (response.status === 429 || (data && data.error === 'too_many_attempts')) {
        setLoginError('Too many login attempts. Try again later.')
        return
      }

      if (!response.ok || !data || data.ok !== true) {
        setLoginError('Invalid credentials.')
        return
      }

      loginForm.reset()
      currentPage = 1
      showAdmin()
      await loadListings()
    } catch {
      setLoginError('Could not reach the server.')
    } finally {
      loginButton.disabled = false
    }
  })

  logoutButton.addEventListener('click', async function () {
    try {
      await api('/api/dbs-console/logout', { method: 'POST' })
    } catch {
      // Still return to login if the cookie cannot be confirmed cleared.
    }
    searchInput.value = ''
    statusSelect.value = 'all'
    sortSelect.value = 'newest'
    currentPage = 1
    listingsEl.innerHTML = ''
    showLogin()
  })

  function resetToFirstPageAndLoad() {
    currentPage = 1
    loadListings()
  }

  statusSelect.addEventListener('change', resetToFirstPageAndLoad)
  sortSelect.addEventListener('change', resetToFirstPageAndLoad)
  document.getElementById('filters').addEventListener('submit', function (event) {
    event.preventDefault()
    clearTimeout(searchTimer)
    resetToFirstPageAndLoad()
  })
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(resetToFirstPageAndLoad, 300)
  })
  searchInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      clearTimeout(searchTimer)
      resetToFirstPageAndLoad()
    }
  })

  prevPage.addEventListener('click', function () {
    if (currentPage > 1) {
      currentPage -= 1
      loadListings()
    }
  })

  nextPage.addEventListener('click', function () {
    currentPage += 1
    loadListings()
  })

  checkSession()
})()
