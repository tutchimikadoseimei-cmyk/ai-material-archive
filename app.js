const PROXY_WORKER_URL = "https://material-proxy.tutchimikadoseimei.workers.dev/?url=";
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxuB6Ps7mBo-Szy2VyOLSqXem0Y38VUFousaF69GinBEBeMrCq6zwz-ngh02fcF5Kmzdw/exec"; // ★ご自身のGAS URLに書き換えてください

let allMaterials = [];
let currentPlayingUrl = "";
let favorites = JSON.parse(localStorage.getItem('ai_material_favs') || '[]');

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    initCustomAudioPlayer();
});

async function initApp() {
    try {
        let response = await fetch(GAS_API_URL);
        
        if (!response.ok) {
            console.warn("GASからの取得に失敗したため、ローカルJSONを使用します。");
            response = await fetch("materials.json");
        }
        
        allMaterials = await response.json();

        const pickupContainer = document.getElementById('auto-scroll-container');
        if (pickupContainer) {
            renderPickup(allMaterials, pickupContainer);
        }

        const listContainer = document.getElementById('list-container');
        if (listContainer) {
            renderCategoryList(allMaterials, listContainer);
        }

        renderFavorites();
        initSearch();

    } catch (error) {
        console.error("エラー:", error);
    }
}

function getProxiedUrl(url) {
    if (!url) return '#';
    if (url.includes('material-proxy')) {
        return url; // すでにGAS側でラップされていればそのまま返す
    }
    if (url.startsWith('http')) {
        return PROXY_WORKER_URL + encodeURIComponent(url);
    }
    return url;
}

function initSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    const params = new URLSearchParams(window.location.search);
    const searchQuery = params.get('search') || params.get('q');

    if (searchQuery) {
        searchInput.value = searchQuery;
        executeSearch(searchQuery);
    }

    searchInput.addEventListener('input', (e) => {
        executeSearch(e.target.value.trim());
    });
}

function executeSearch(queryText) {
    const query = queryText.toLowerCase();
    const pickupTitle = document.getElementById('pickup-title');
    const container = document.getElementById('auto-scroll-container');

    if (!container) return;

    if (query === '') {
        if (pickupTitle) pickupTitle.textContent = "🔥 注目ピックアップ";
        renderPickup(allMaterials, container);
        return;
    }

    if (pickupTitle) pickupTitle.textContent = `🔍 検索結果: "${queryText}"`;

    const filtered = allMaterials.filter(item => {
        const titleMatch = item.title.toLowerCase().includes(query);
        const tagMatch = item.tags.some(tag => tag.toLowerCase().includes(query));
        const categoryMatch = item.category ? item.category.toLowerCase().includes(query) : false;
        const channelMatch = item.channel ? item.channel.toLowerCase().includes(query) : false;
        
        return titleMatch || tagMatch || categoryMatch || channelMatch;
    });

    renderPickup(filtered, container);
}

function toggleFavorite(itemId, event) {
    event.stopPropagation();
    const index = favorites.indexOf(itemId);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(itemId);
    }
    localStorage.setItem('ai_material_favs', JSON.stringify(favorites));

    document.querySelectorAll(`.fav-btn[data-id="${itemId}"]`).forEach(btn => {
        const isFav = favorites.includes(itemId);
        btn.classList.toggle('active', isFav);
        btn.textContent = isFav ? '❤️' : '♡';
    });

    renderFavorites();
}

function renderFavorites() {
    const container = document.getElementById('favorites-scroll-container');
    if (!container) return;

    const favItems = allMaterials.filter(item => favorites.includes(item.id));

    if (favItems.length === 0) {
        container.innerHTML = "<p style='color: var(--text-secondary); padding: 10px;'>お気に入りに追加された素材はまだありません。ハートマークを押して保存してみましょう！</p>";
        return;
    }

    container.innerHTML = "";
    favItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "scroll-card";

        const proxiedUrl = getProxiedUrl(item.fileUrl);
        const downloadPageUrl = `download.html?title=${encodeURIComponent(item.title)}&channel=${encodeURIComponent(item.channel)}&type=${encodeURIComponent(item.type || 'bgm')}&url=${encodeURIComponent(proxiedUrl)}&tags=${encodeURIComponent(item.tags.join(" "))}&category=${encodeURIComponent(item.category)}`;

        const durationDisplay = item.duration ? `<span style="font-size: 0.75rem; color: var(--text-secondary);">⏱ ${escapeHTML(item.duration)}</span>` : '';

        card.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="card-header-tag">🎵 ${escapeHTML(item.channel)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${durationDisplay}
                        <button class="fav-btn active" data-id="${item.id}" onclick="toggleFavorite('${item.id}', event)" title="お気に入り解除">❤️</button>
                    </div>
                </div>
                <h4 class="material-title">${escapeHTML(item.title)}</h4>
                <p class="material-tags">${escapeHTML(item.tags.join(" "))}</p>
            </div>
            <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8rem; color: var(--accent-color);">▶ 試聴する</span>
                <a href="${downloadPageUrl}" class="action-btn" style="padding: 6px 12px; font-size: 0.75rem; text-decoration:none;" onclick="event.stopPropagation();">ダウンロード</a>
            </div>
        `;

        card.addEventListener("click", () => {
            playAudio({ ...item, fileUrl: proxiedUrl });
        });

        container.appendChild(card);
    });
}

function renderPickup(materials, container) {
    container.innerHTML = "";
    if (materials.length === 0) {
        container.innerHTML = "<p style='color: var(--text-secondary); padding: 10px;'>該当する素材が見つかりませんでした。</p>";
        return;
    }

    materials.forEach(item => {
        const card = document.createElement("div");
        card.className = "scroll-card";

        const proxiedUrl = getProxiedUrl(item.fileUrl);
        const downloadPageUrl = `download.html?title=${encodeURIComponent(item.title)}&channel=${encodeURIComponent(item.channel)}&type=${encodeURIComponent(item.type || 'bgm')}&url=${encodeURIComponent(proxiedUrl)}&tags=${encodeURIComponent(item.tags.join(" "))}&category=${encodeURIComponent(item.category)}`;

        const durationDisplay = item.duration ? `<span style="font-size: 0.75rem; color: var(--text-secondary);">⏱ ${escapeHTML(item.duration)}</span>` : '';
        const isFav = favorites.includes(item.id);

        card.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="card-header-tag">🎵 ${escapeHTML(item.channel)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${durationDisplay}
                        <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${item.id}" onclick="toggleFavorite('${item.id}', event)" title="お気に入り">${isFav ? '❤️' : '♡'}</button>
                    </div>
                </div>
                <h4 class="material-title">${escapeHTML(item.title)}</h4>
                <p class="material-tags">${escapeHTML(item.tags.join(" "))}</p>
            </div>
            <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8rem; color: var(--accent-color);">▶ 試聴する</span>
                <a href="${downloadPageUrl}" class="action-btn" style="padding: 6px 12px; font-size: 0.75rem; text-decoration:none;" onclick="event.stopPropagation();">ダウンロード</a>
            </div>
        `;

        card.addEventListener("click", () => {
            playAudio({ ...item, fileUrl: proxiedUrl });
        });

        container.appendChild(card);
    });
}

function renderCategoryList(materials, container) {
    const params = new URLSearchParams(window.location.search);
    const targetCategory = params.get("category");
    const targetType = params.get("type");

    const titleEl = document.getElementById("category-title");
    const descEl = document.getElementById("category-description");

    if (targetCategory) {
        if (titleEl) titleEl.textContent = `📂 ${targetCategory} の素材`;
        if (descEl) descEl.textContent = `「${targetCategory}」カテゴリに登録されている素材一覧です。`;
    }

    const filtered = materials.filter(item => {
        if (targetCategory && item.category !== targetCategory) return false;

        if (targetType) {
            const isBgCategory = item.category && (
                item.category.includes('学校') || item.category.includes('日常') || 
                item.category.includes('自然') || item.category.includes('空') || 
                item.category.includes('ダンジョン') || item.category.includes('廃墟') || 
                item.category.includes('SF') || item.category.includes('建築')
            );
            const itemType = item.type || (isBgCategory ? 'image' : 'bgm');
            if (itemType !== targetType) return false;
        }
        return true;
    });

    container.innerHTML = "";
    if (filtered.length === 0) {
        container.innerHTML = "<p style='color: var(--text-secondary);'>このカテゴリに一致する素材はまだ登録されていません。</p>";
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "material-card";
        card.style.cursor = "pointer";

        const proxiedUrl = getProxiedUrl(item.fileUrl);
        const downloadPageUrl = `download.html?title=${encodeURIComponent(item.title)}&channel=${encodeURIComponent(item.channel)}&type=${encodeURIComponent(item.type || 'bgm')}&url=${encodeURIComponent(proxiedUrl)}&tags=${encodeURIComponent(item.tags.join(" "))}&category=${encodeURIComponent(item.category)}`;

        const durationDisplay = item.duration ? `<span style="font-size: 0.8rem; color: var(--text-secondary);">⏱ ${escapeHTML(item.duration)}</span>` : '';
        const isFav = favorites.includes(item.id);

        card.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="card-header-tag">${escapeHTML(item.channel)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${durationDisplay}
                        <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${item.id}" onclick="toggleFavorite('${item.id}', event)" title="お気に入り">${isFav ? '❤️' : '♡'}</button>
                    </div>
                </div>
                <h3 class="material-title" style="margin-top:8px;">${escapeHTML(item.title)}</h3>
                <p class="material-tags">${escapeHTML(item.tags.join(" "))}</p>
            </div>
            <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8rem; color: var(--accent-color);">▶ 試聴する</span>
                <a href="${downloadPageUrl}" class="action-btn" style="text-align:center; text-decoration:none; padding: 8px 16px;" onclick="event.stopPropagation();">ダウンロード</a>
            </div>
        `;

        card.addEventListener("click", () => {
            playAudio({ ...item, fileUrl: proxiedUrl });
        });

        container.appendChild(card);
    });
}

function playAudio(item) {
    const bar = document.getElementById("sticky-player-bar");
    const audio = document.getElementById("hidden-audio");
    const titleEl = document.getElementById("sticky-title");
    const catEl = document.getElementById("sticky-category");
    const dlBtn = document.getElementById("sticky-download-btn");
    const playBtn = document.getElementById("play-pause-btn");

    if (!bar || !audio) return;

    bar.style.display = "flex";
    titleEl.textContent = item.title;
    catEl.textContent = `${item.channel} / ${item.category}`;

    const downloadPageUrl = `download.html?title=${encodeURIComponent(item.title)}&channel=${encodeURIComponent(item.channel)}&type=${encodeURIComponent(item.type || 'bgm')}&url=${encodeURIComponent(item.fileUrl)}&tags=${encodeURIComponent(item.tags.join(" "))}&category=${encodeURIComponent(item.category)}`;
    if (dlBtn) dlBtn.href = downloadPageUrl;

    if (currentPlayingUrl !== item.fileUrl) {
        currentPlayingUrl = item.fileUrl;
        audio.src = item.fileUrl;
        audio.load();
    }

    audio.play().then(() => {
        if (playBtn) playBtn.textContent = "⏸";
    }).catch(e => console.log("自動再生ブロック:", e));
}

function initCustomAudioPlayer() {
    const audio = document.getElementById("hidden-audio");
    const playBtn = document.getElementById("play-pause-btn");
    const back30Btn = document.getElementById("back-30-btn");
    const back10Btn = document.getElementById("back-10-btn");
    const forward10Btn = document.getElementById("forward-10-btn");
    const forward30Btn = document.getElementById("forward-30-btn");
    const loopBtn = document.getElementById("loop-btn");
    const volumeSlider = document.getElementById("volume-slider");
    const progressBar = document.getElementById("progress-bar");
    const progressFilled = document.getElementById("progress-filled");
    const currentTimeEl = document.getElementById("current-time");
    const totalTimeEl = document.getElementById("total-time");

    if (!audio || !playBtn) return;

    playBtn.addEventListener("click", () => {
        if (audio.paused) {
            audio.play();
            playBtn.textContent = "⏸";
        } else {
            audio.pause();
            playBtn.textContent = "▶";
        }
    });

    if (back30Btn) back30Btn.addEventListener("click", () => { if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - 30); });
    if (back10Btn) back10Btn.addEventListener("click", () => { if (audio.duration) audio.currentTime = Math.max(0, audio.duration - 10); });
    if (forward10Btn) forward10Btn.addEventListener("click", () => { if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); });
    if (forward30Btn) forward30Btn.addEventListener("click", () => { if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 30); });

    let isLooping = false;
    if (loopBtn) {
        loopBtn.addEventListener("click", () => {
            isLooping = !isLooping;
            audio.loop = isLooping;
            if (isLooping) {
                loopBtn.classList.add("active-loop");
                loopBtn.title = "ループ再生：ON";
            } else {
                loopBtn.classList.remove("active-loop");
                loopBtn.title = "ループ再生：OFF";
            }
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener("input", (e) => {
            audio.volume = e.target.value;
        });
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    audio.addEventListener("loadedmetadata", () => {
        totalTimeEl.textContent = formatTime(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
        if (audio.duration && !isNaN(audio.duration)) {
            const percent = (audio.currentTime / audio.duration) * 100;
            progressFilled.style.width = `${percent}%`;
            currentTimeEl.textContent = formatTime(audio.currentTime);
        }
    });

    audio.addEventListener("ended", () => {
        if (!audio.loop) {
            playBtn.textContent = "▶";
            progressFilled.style.width = "0%";
            currentTimeEl.textContent = "0:00";
        }
    });

    progressBar.addEventListener("click", (e) => {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        if (audio.duration && !isNaN(audio.duration) && width > 0) {
            const clickRatio = Math.max(0, Math.min(1, clickX / width));
            audio.currentTime = clickRatio * audio.duration;
        }
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}
