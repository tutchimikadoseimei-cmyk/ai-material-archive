const PROXY_WORKER_URL = "https://material-proxy.tutchimikadoseimei.workers.dev/?url=";
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxuB6Ps7mBo-Szy2VyOLSqXem0Y38VUFousaF69GinBEBeMrCq6zwz-ngh02fcF5Kmzdw/exec";

let allMaterials = [];
let allCategories = [];
let currentPlayingUrl = "";

// 🔒 堅牢なlocalStorage読み込み（お気に入り）
let favorites = [];
try {
    const rawFavs = localStorage.getItem('ai_material_favs');
    const parsed = rawFavs ? JSON.parse(rawFavs) : [];
    if (Array.isArray(parsed)) {
        favorites = parsed.map(id => String(id));
    }
} catch (e) {
    console.warn("お気に入りデータの読み込みに失敗しました:", e);
    favorites = [];
    localStorage.setItem('ai_material_favs', JSON.stringify(favorites));
}

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    initCustomAudioPlayer();
    initFavoriteBackupTools();
});

// 🚀 爆速化：localStorageキャッシュを活用した初期化処理
async function initApp() {
    const CACHE_KEY = 'ai_material_cache_v1';
    const CACHE_TIME_KEY = 'ai_material_cache_time_v1';
    const CACHE_TTL = 30 * 60 * 1000; // 30分間キャッシュ有効

    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
        const now = new Date().getTime();

        // キャッシュが存在し有効期限内であれば、ネットワーク通信をスキップして即座に描画
        if (cachedData && cachedTime && (now - cachedTime < CACHE_TTL)) {
            const data = JSON.parse(cachedData);
            processMaterialData(data);
            return;
        }

        let response = await fetch(GAS_API_URL);
        if (!response.ok) throw new Error("GASからの取得に失敗しました");

        const data = await response.json();
        
        // キャッシュに保存
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TIME_KEY, now);

        processMaterialData(data);

    } catch (error) {
        console.warn("GASからの取得に失敗、ローカルフォールバックを使用:", error);
        try {
            let resLocal = await fetch("materials.json");
            let rawData = await resLocal.json();
            processMaterialData(rawData);
        } catch (e) {
            console.error("ローカルJSONの読み込みにも失敗しました:", e);
        }
    }
}

// データのパースと各セクション描画の共通処理
function processMaterialData(data) {
    if (Array.isArray(data)) {
        allMaterials = data;
        allCategories = [...new Set(data.map(item => item.channel || item.category))];
    } else {
        allMaterials = data.materials || [];
        allCategories = data.categories || [];
    }

    allMaterials.forEach(item => {
        if (item.duration && item.duration.includes('GMT')) {
            item.duration = '4:00';
        }
    });

    renderDynamicCategories(allCategories);
    const pickupContainer = document.getElementById('auto-scroll-container');
    if (pickupContainer) {
        renderPickup(allMaterials, pickupContainer);
    }

    const listContainer = document.getElementById('list-container');
    if (listContainer) {
        renderCategoryList(allMaterials, listContainer);
    }

    renderFavorites();
    initSearchAndFilter();
}

function renderDynamicCategories(categories) {
    const categoryNav = document.getElementById('dynamic-category-nav');
    if (!categoryNav) return;

    categoryNav.innerHTML = "";
    categories.forEach(cat => {
        const link = document.createElement('a');
        link.className = 'category-btn';
        link.href = `index.html?category=${encodeURIComponent(cat)}`;
        link.textContent = `📁 ${cat}`;
        categoryNav.appendChild(link);
    });
}

function getProxiedUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    if (url.includes('material-proxy')) return url;

    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
        if (parsed.hostname.includes('discord')) {
            return PROXY_WORKER_URL + encodeURIComponent(url);
        }
        return url;
    } catch (e) {
        return '#';
    }
}

function handleCardClick(item, proxiedUrl, downloadPageUrl) {
    if (item.type === 'image') {
        openImageModal(item, proxiedUrl, downloadPageUrl);
    } else {
        playAudio({ ...item, fileUrl: proxiedUrl });
    }
}

function openImageModal(item, proxiedUrl, downloadPageUrl) {
    const existingModal = document.getElementById('image-preview-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'image-preview-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.85); display: flex; flex-direction: column;
        justify-content: center; align-items: center; z-index: 9999; padding: 20px;
        box-sizing: border-box; overflow: hidden;
    `;

    modal.innerHTML = `
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${proxiedUrl}'); background-size: cover; background-position: center; filter: blur(20px) brightness(0.4); transform: scale(1.1); z-index: 0;"></div>
        
        <div style="position: relative; max-width: 90%; max-height: 85%; display: flex; flex-direction: column; align-items: center; background: rgba(30, 30, 46, 0.9); backdrop-filter: blur(10px); padding: 25px; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); z-index: 1; border: 1px solid rgba(255,255,255,0.1);">
            <button id="close-modal-btn" style="position: absolute; top: 12px; right: 15px; background: none; border: none; color: #fff; font-size: 22px; cursor: pointer; z-index: 10;">✕</button>
            <img src="${proxiedUrl}" alt="${escapeHTML(item.title)}" style="max-width: 100%; max-height: 55vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
            <h3 style="color: #fff; margin-top: 15px; font-size: 1.2rem; text-align: center;">${escapeHTML(item.title)}</h3>
            <p style="color: #ccc; font-size: 0.85rem; margin-top: 5px;">${escapeHTML((item.tags || []).join(" "))}</p>
            <div style="margin-top: 15px;">
                <a href="${downloadPageUrl}" class="action-btn" style="text-decoration:none; padding: 10px 24px; font-size: 0.9rem; display: inline-block;">ダウンロードページへ</a>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'close-modal-btn') {
            modal.remove();
        }
    });
}

function initSearchAndFilter() {
    const searchInput = document.getElementById('search-input');
    const container = document.getElementById('auto-scroll-container');
    const pickupTitle = document.getElementById('pickup-title');
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const searchQuery = params.get('q') || params.get('search') || '';
    const targetCategory = params.get('category') || '';
    const targetType = params.get('type') || '';
    const sortBy = params.get('sort') || 'new';

    if (searchInput && searchQuery) {
        searchInput.value = searchQuery;
    }

    let filtered = allMaterials.filter(item => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const titleMatch = item.title ? item.title.toLowerCase().includes(q) : false;
            const tagMatch = Array.isArray(item.tags) ? item.tags.some(tag => tag.toLowerCase().includes(q)) : false;
            const categoryMatch = item.category ? item.category.toLowerCase().includes(q) : false;
            const channelMatch = item.channel ? item.channel.toLowerCase().includes(q) : false;
            if (!titleMatch && !tagMatch && !categoryMatch && !channelMatch) return false;
        }

        if (targetCategory) {
            const matchCat = item.category === targetCategory || item.channel === targetCategory;
            if (!matchCat) return false;
        }

        if (targetType) {
            if (item.type !== targetType) return false;
        }

        return true;
    });

    if (sortBy === 'name') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
        filtered.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    }

    if (pickupTitle) {
        let titleText = "🔥 注目ピックアップ";
        if (searchQuery || targetCategory || targetType) {
            titleText = `🔍 検索・絞り込み結果 (${filtered.length}件)`;
        } else {
            titleText = `🔥 注目ピックアップ (${filtered.length}件)`;
        }
        pickupTitle.innerHTML = `${titleText} <a href="index.html" style="font-size:0.8rem; margin-left:15px; color:var(--accent-color); text-decoration:underline; ${(searchQuery || targetCategory || targetType) ? '' : 'display:none;'}">条件クリア</a>`;
    }

    renderPickup(filtered, container);

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            const currentParams = new URLSearchParams(window.location.search);
            if (val) {
                currentParams.set('q', val);
            } else {
                currentParams.delete('q');
            }
            const newRelativePathQuery = window.location.pathname + '?' + currentParams.toString();
            history.replaceState(null, '', newRelativePathQuery);
            initSearchAndFilter();
        });
    }
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

function createCardElement(item, proxiedUrl, downloadPageUrl, isFav, durationDisplay, cardClass = "material-card") {
    const card = document.createElement("div");
    card.className = cardClass;

    let thumbnailHtml = "";
    if (item.type === 'image' && proxiedUrl) {
        thumbnailHtml = `
            <div class="card-thumbnail-wrap">
                <img src="${proxiedUrl}" alt="${escapeHTML(item.title)}" loading="lazy">
            </div>
        `;
    }

    card.innerHTML = `
        ${thumbnailHtml}
        <div class="card-info">
            <div>
                <div class="card-header-row">
                    <span class="card-header-tag">${item.type === 'image' ? '🖼️' : '🎵'} ${escapeHTML(item.channel)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${durationDisplay}
                        <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${item.id}" onclick="toggleFavorite('${item.id}', event)" title="お気に入り">${isFav ? '❤️' : '♡'}</button>
                    </div>
                </div>
                <h4 class="material-title">${escapeHTML(item.title)}</h4>
                <p class="material-tags">${escapeHTML((item.tags || []).join(" "))}</p>
            </div>
            <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
                <span style="font-size: 0.8rem; color: var(--accent-color); font-weight: 500;">${item.type === 'image' ? '🔍 拡大表示' : '▶ 試聴する'}</span>
                <a href="${downloadPageUrl}" class="action-btn" style="padding: 6px 14px; font-size: 0.75rem; text-decoration:none;" onclick="event.stopPropagation();">詳細・DL</a>
            </div>
        </div>
    `;

    card.addEventListener("click", () => {
        handleCardClick(item, proxiedUrl, downloadPageUrl);
    });

    return card;
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
        const proxiedUrl = getProxiedUrl(item.fileUrl);
        const downloadPageUrl = `download.html?title=${encodeURIComponent(item.title)}&channel=${encodeURIComponent(item.channel)}&type=${encodeURIComponent(item.type || 'bgm')}&url=${encodeURIComponent(proxiedUrl)}&tags=${encodeURIComponent((item.tags || []).join(" "))}&category=${encodeURIComponent(item.category)}`;
        const durationDisplay = item.duration && item.duration !== '-' ? `<span style="font-size: 0.75rem; color: var(--text-secondary);">⏱ ${escapeHTML(item.duration)}</span>` : '';
        const isFav = favorites.includes(item.id);

        const card = createCardElement(item, proxiedUrl, downloadPageUrl, isFav, durationDisplay, "material-card");
        container.appendChild(card);
    });
}

function renderPickup(materials, container) {
    container.innerHTML = "";
    if (materials.length === 0) {
        container.innerHTML = "<div style='grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);'><p style='font-size: 1.1rem; margin-bottom: 10px;'>🔍 条件に一致する素材が見つかりませんでした。</p><a href='index.html' style='color: var(--accent-color); text-decoration: underline;'>すべての素材を表示する</a></div>";
        return;
    }

    materials.forEach(item => {
        const proxiedUrl = getProxiedUrl(item.fileUrl);
        const downloadPageUrl = `download.html?title=${encodeURIComponent(item.title)}&channel=${encodeURIComponent(item.channel)}&type=${encodeURIComponent(item.type || 'bgm')}&url=${encodeURIComponent(proxiedUrl)}&tags=${encodeURIComponent((item.tags || []).join(" "))}&category=${encodeURIComponent(item.category)}`;
        const durationDisplay = item.duration && item.duration !== '-' ? `<span style="font-size: 0.75rem; color: var(--text-secondary);">⏱ ${escapeHTML(item.duration)}</span>` : '';
        const isFav = favorites.includes(item.id);

        const card = createCardElement(item, proxiedUrl, downloadPageUrl, isFav, durationDisplay, "material-card");
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
        if (targetCategory) {
            const matchCategory = item.category === targetCategory;
            const matchChannel = item.channel === targetCategory;
            if (!matchCategory && !matchChannel) return false;
        }

        if (targetType) {
            if (item.type !== targetType) return false;
        }
        return true;
    });

    container.innerHTML = "";
    if (filtered.length === 0) {
        container.innerHTML = "<p style='color: var(--text-secondary);'>このカテゴリに一致する素材はまだ登録されていません。</p>";
        return;
    }

    filtered.forEach(item => {
        const proxiedUrl = getProxiedUrl(item.fileUrl);
        const downloadPageUrl = `download.html?title=${encodeURIComponent(item.title)}&channel=${encodeURIComponent(item.channel)}&type=${encodeURIComponent(item.type || 'bgm')}&url=${encodeURIComponent(proxiedUrl)}&tags=${encodeURIComponent((item.tags || []).join(" "))}&category=${encodeURIComponent(item.category)}`;
        const durationDisplay = item.duration && item.duration !== '-' ? `<span style="font-size: 0.8rem; color: var(--text-secondary);">⏱ ${escapeHTML(item.duration)}</span>` : '';
        const isFav = favorites.includes(item.id);

        const card = createCardElement(item, proxiedUrl, downloadPageUrl, isFav, durationDisplay, "material-card");
        container.appendChild(card);
    });
}

function initFavoriteBackupTools() {
    window.exportFavorites = function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(favorites));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "ai_material_favorites_backup.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    window.importFavorites = function(event) {
        const fileReader = new FileReader();
        if (event.target.files[0]) {
            fileReader.readAsText(event.target.files[0], "UTF-8");
            fileReader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result);
                    if (Array.isArray(imported)) {
                        favorites = [...new Set([...favorites, ...imported.map(id => String(id))])];
                        localStorage.setItem('ai_material_favs', JSON.stringify(favorites));
                        renderFavorites();
                        alert("お気に入りを正常にインポートしました！");
                    }
                } catch (err) {
                    alert("バックアップファイルの読み込みに失敗しました。");
                }
            };
        }
    };
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

    const downloadPageUrl = `download.html?title=${encodeURIComponent(item.title)}&channel=${encodeURIComponent(item.channel)}&type=${encodeURIComponent(item.type || 'bgm')}&url=${encodeURIComponent(item.fileUrl)}&tags=${encodeURIComponent((item.tags || []).join(" "))}&category=${encodeURIComponent(item.category)}`;
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
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}
