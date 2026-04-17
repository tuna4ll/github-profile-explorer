const API_URL = "https://api.github.com/users/";

const form = document.getElementById("form");
const search = document.getElementById("search");
const main = document.getElementById("main");
const numberFormatter = new Intl.NumberFormat("tr-TR");

let activeController = null;

form.addEventListener("submit", handleSubmit);

async function handleSubmit(event) {
  event.preventDefault();

  const normalizedUsername = normalizeUsername(search.value);

  if (!normalizedUsername) {
    renderPageState(
      "Geçerli bir GitHub kullanıcı adı yazman gerekiyor.",
      "error"
    );
    search.focus();
    return;
  }

  search.value = normalizedUsername;

  if (activeController) {
    activeController.abort();
  }

  const controller = new AbortController();
  activeController = controller;

  renderLoadingState(normalizedUsername);

  try {
    const user = await fetchJSON(
      `${API_URL}${encodeURIComponent(normalizedUsername)}`,
      controller.signal
    );

    renderUserCard(user);
    await loadRepos(user.login, user.public_repos, controller.signal);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    renderPageState(getUserErrorMessage(error), "error");
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
  }
}

function normalizeUsername(value) {
  return value.trim().replace(/^@+/, "");
}

async function fetchJSON(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    error.remaining = response.headers.get("x-ratelimit-remaining");
    throw error;
  }

  return response.json();
}

async function loadRepos(username, publicRepoCount, signal) {
  renderRepoState("Depolar yükleniyor...", "loading");

  try {
    const repos = await fetchAllRepos(username, publicRepoCount, signal);
    renderRepos(repos);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    renderRepoState(getRepoErrorMessage(error), "error");
  }
}

async function fetchAllRepos(username, publicRepoCount, signal) {
  if (publicRepoCount === 0) {
    return [];
  }

  const repos = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const pageRepos = await fetchJSON(
      `${API_URL}${encodeURIComponent(
        username
      )}/repos?sort=updated&per_page=${perPage}&page=${page}`,
      signal
    );

    repos.push(...pageRepos);

    if (pageRepos.length < perPage || repos.length >= publicRepoCount) {
      break;
    }

    page += 1;
  }

  return repos;
}

function renderLoadingState(username) {
  renderPageState(
    `"${username}" için profil bilgileri yükleniyor.`,
    "loading"
  );
}

function renderPageState(message, variant = "empty") {
  const section = createElement("section", {
    className: `panel state-card ${variant}-state`,
  });
  const iconWrap = createElement("div", {
    className: "state-icon",
    attrs: { "aria-hidden": "true" },
  });
  const icon = createElement("i", {
    className: getStateIconClass(variant),
    attrs: { "aria-hidden": "true" },
  });
  const title = createElement("h2", {
    text: getStateTitle(variant),
  });
  const description = createElement("p", { text: message });

  iconWrap.append(icon);
  section.append(iconWrap, title, description);
  main.replaceChildren(section);
}

function renderUserCard(user) {
  const displayName = user.name || user.login;
  const card = createElement("article", {
    className: "panel profile-card",
  });
  const header = createElement("div", {
    className: "profile-header",
  });
  const avatar = createElement("img", {
    className: "user-image",
    attrs: {
      src: user.avatar_url,
      alt: `${displayName} profil resmi`,
      loading: "lazy",
      width: "160",
      height: "160",
    },
  });
  const content = createElement("div", {
    className: "profile-copy",
  });
  const heading = createElement("div", {
    className: "username",
  });
  const titleWrap = createElement("div", {
    className: "title-wrap",
  });
  const name = createElement("h2", { text: displayName });
  const handle = createElement("p", {
    className: "handle",
    text: `@${user.login}`,
  });
  const bio = createElement("p", {
    className: `bio ${user.bio ? "" : "bio-muted"}`.trim(),
    text: user.bio || "Bu kullanıcı henüz biyografi eklememiş.",
  });
  const actions = createElement("div", {
    className: "profile-actions",
  });
  const profileLink = createElement("a", {
    className: "profile-link",
    text: "GitHub Profilini Aç",
    attrs: {
      href: user.html_url,
      target: "_blank",
      rel: "noopener noreferrer",
    },
  });

  titleWrap.append(name, handle);
  actions.append(profileLink);
  heading.append(titleWrap, actions);
  content.append(heading, bio);

  const metaItems = buildProfileMeta(user);

  if (metaItems.length > 0) {
    const meta = createElement("div", {
      className: "profile-meta",
    });

    metaItems.forEach((item) => meta.append(item));
    content.append(meta);
  }

  header.append(avatar, content);

  const stats = createElement("ul", {
    className: "stats",
    attrs: { role: "list" },
  });

  stats.append(
    createStatItem("Takipçi", user.followers, "fa-solid fa-user-group"),
    createStatItem("Takip", user.following, "fa-solid fa-user-plus"),
    createStatItem("Açık Repo", user.public_repos, "fa-solid fa-book-bookmark")
  );

  const repoSection = createElement("section", {
    className: "repo-section",
  });
  const repoHeading = createElement("div", {
    className: "section-heading",
  });
  const repoTitleWrap = createElement("div");
  const repoTitle = createElement("h3", {
    text: "Açık Repolar",
  });
  const repoSubtitle = createElement("p", {
    className: "section-subtitle",
    text: "Liste, en son güncellenen repolardan başlayarak yüklenir.",
  });
  const repoCount = createElement("span", {
    className: "repo-count",
    text: `${numberFormatter.format(user.public_repos)} repo`,
  });
  const repos = createElement("div", {
    className: "repo-list",
    attrs: { id: "repos" },
  });

  repoTitleWrap.append(repoTitle, repoSubtitle);
  repoHeading.append(repoTitleWrap, repoCount);
  repoSection.append(repoHeading, repos);

  card.append(header, stats, repoSection);
  main.replaceChildren(card);
}

function buildProfileMeta(user) {
  const items = [];
  const websiteUrl = normalizeWebsiteUrl(user.blog);

  if (user.company) {
    items.push(createInfoChip("fa-solid fa-building", user.company));
  }

  if (user.location) {
    items.push(createInfoChip("fa-solid fa-location-dot", user.location));
  }

  if (websiteUrl) {
    items.push(
      createInfoChip("fa-solid fa-link", "Web sitesi", {
        href: websiteUrl,
      })
    );
  }

  return items;
}

function normalizeWebsiteUrl(url) {
  if (!url) {
    return null;
  }

  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return null;
  }

  const normalizedUrl = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    return new URL(normalizedUrl).toString();
  } catch {
    return null;
  }
}

function createInfoChip(iconClass, text, linkOptions = null) {
  const item = createElement(linkOptions ? "a" : "span", {
    className: "meta-chip",
    attrs: linkOptions
      ? {
          href: linkOptions.href,
          target: "_blank",
          rel: "noopener noreferrer",
        }
      : {},
  });
  const icon = createElement("i", {
    className: iconClass,
    attrs: { "aria-hidden": "true" },
  });
  const label = createElement("span", { text });

  item.append(icon, label);
  return item;
}

function createStatItem(label, value, iconClass) {
  const item = createElement("li");
  const topRow = createElement("div", {
    className: "stat-top",
  });
  const icon = createElement("i", {
    className: iconClass,
    attrs: { "aria-hidden": "true" },
  });
  const statLabel = createElement("span", {
    className: "stat-label",
    text: label,
  });
  const statValue = createElement("strong", {
    className: "stat-value",
    text: numberFormatter.format(value),
  });

  topRow.append(icon, statLabel);
  item.append(topRow, statValue);

  return item;
}

function renderRepoState(message, variant = "default") {
  const repos = document.getElementById("repos");

  if (!repos) {
    return;
  }

  const state = createElement("div", {
    className: `repo-state ${variant === "error" ? "repo-state-error" : ""}`.trim(),
    text: message,
  });

  repos.replaceChildren(state);
}

function renderRepos(repos) {
  const repoContainer = document.getElementById("repos");

  if (!repoContainer) {
    return;
  }

  if (repos.length === 0) {
    renderRepoState("Bu kullanıcının herkese açık bir reposu görünmüyor.");
    return;
  }

  const fragment = document.createDocumentFragment();

  repos.forEach((repo) => {
    fragment.append(createRepoCard(repo));
  });

  repoContainer.replaceChildren(fragment);
}

function createRepoCard(repo) {
  const link = createElement("a", {
    className: "repo-link",
    attrs: {
      href: repo.html_url,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": `${repo.name} reposunu yeni sekmede aç`,
    },
  });
  const title = createElement("div", {
    className: "repo-name",
  });
  const icon = createElement("i", {
    className: "fa-solid fa-book-bookmark",
    attrs: { "aria-hidden": "true" },
  });
  const name = createElement("span", {
    text: repo.name,
  });
  const description = createElement("p", {
    className: "repo-description",
    text: repo.description || "Bu repo için açıklama girilmemiş.",
  });
  const meta = createElement("div", {
    className: "repo-meta",
  });

  title.append(icon, name);
  meta.append(
    createRepoPill("fa-solid fa-star", numberFormatter.format(repo.stargazers_count)),
    createRepoPill("fa-solid fa-code-fork", numberFormatter.format(repo.forks_count))
  );

  if (repo.language) {
    meta.append(createRepoPill("fa-solid fa-code", repo.language));
  }

  if (repo.fork) {
    meta.append(createRepoPill("fa-solid fa-code-branch", "Fork"));
  }

  link.append(title, description, meta);
  return link;
}

function createRepoPill(iconClass, text) {
  const pill = createElement("span", {
    className: "repo-pill",
  });
  const icon = createElement("i", {
    className: iconClass,
    attrs: { "aria-hidden": "true" },
  });
  const label = createElement("span", { text });

  pill.append(icon, label);
  return pill;
}

function createElement(tagName, options = {}) {
  const { className = "", text, attrs = {} } = options;
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  Object.entries(attrs).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      element.setAttribute(name, value);
    }
  });

  return element;
}

function getUserErrorMessage(error) {
  if (error.status === 404) {
    return "Aradığın GitHub kullanıcısı bulunamadı.";
  }

  if (error.status === 403 && error.remaining === "0") {
    return "GitHub istek sınırına ulaşıldı, biraz sonra tekrar dene.";
  }

  if (error.status === 403) {
    return "GitHub bu isteği şu anda kabul etmedi, biraz sonra tekrar dene.";
  }

  if (error.name === "TypeError") {
    return "GitHub'a bağlanırken bir ağ hatası oluştu.";
  }

  return "Profil bilgileri yüklenirken beklenmeyen bir hata oluştu.";
}

function getRepoErrorMessage(error) {
  if (error.status === 403 && error.remaining === "0") {
    return "Repo listesi istek sınırı yüzünden şu anda yüklenemedi.";
  }

  if (error.status === 403) {
    return "Repo listesi GitHub tarafında geçici olarak engellendi.";
  }

  if (error.name === "TypeError") {
    return "Repo listesi yüklenirken bir ağ hatası oluştu.";
  }

  return "Repo listesi yüklenirken beklenmeyen bir hata oluştu.";
}

function getStateIconClass(variant) {
  if (variant === "loading") {
    return "fa-solid fa-spinner is-spinning";
  }

  if (variant === "error") {
    return "fa-solid fa-circle-exclamation";
  }

  return "fa-brands fa-github";
}

function getStateTitle(variant) {
  if (variant === "loading") {
    return "Yükleniyor";
  }

  if (variant === "error") {
    return "Bir sorun oluştu";
  }

  return "Bir kullanıcı ara";
}
