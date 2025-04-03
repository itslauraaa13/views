document.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("app");
    const videoFeed = document.getElementById("video-feed");
    const foldersView = document.getElementById("folders-view");
    const profileView = document.getElementById("profile-view");
    const uploadBtn = document.getElementById("uploadBtn");
    const videoUpload = document.getElementById("videoUpload");
    const forYouBtn = document.getElementById("forYouBtn");
    const foldersBtn = document.getElementById("foldersBtn");
    const profileBtn = document.getElementById("profileBtn");
    const foldersGrid = document.querySelector(".folders-grid");
    const profileVideosGrid = document.getElementById("profile-videos-grid");
    const profileFavoritesGrid = document.getElementById("profile-favorites-grid");
    const profileVideosTab = document.getElementById("profile-videos-tab");
    const profileFavoritesTab = document.getElementById("profile-favorites-tab");
    const profileUsername = document.getElementById("profile-username");
    const profileAvatarImg = document.getElementById("profile-avatar-img");
    const profileVideosCount = document.getElementById("profile-videos-count");
    const profileFoldersCount = document.getElementById("profile-folders-count");

    let videos = [];
    let currentIndex = 0;
    let folders = {};
    let touchStartY = 0;
    let touchEndY = 0;
    let touchStartX = 0;
    let touchEndX = 0;
    let isScrolling = false;
    let isHorizontalScroll = false;
    let touchStartTime = 0;
    let currentVideo = null;
    let isTransitioning = false;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let isSeeking = false;
    let seekStartX = 0;
    let seekStartTime = 0;
    let seekBlockSize = 30; // Tamanho do bloco de tempo em segundos
    let currentUser = null;

    // Prevenir comportamento padrão de scroll/gestos
    app.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // Inicializar o aplicativo
    initApp();

    // Event Listeners
    uploadBtn.addEventListener("click", () => videoUpload.click());
    forYouBtn.addEventListener("click", () => switchView("forYou"));
    foldersBtn.addEventListener("click", () => switchView("folders"));
    profileBtn.addEventListener("click", () => switchView("profile"));
    videoUpload.addEventListener("change", handleUpload);
    profileVideosTab.addEventListener("click", () => switchProfileTab("videos"));
    profileFavoritesTab.addEventListener("click", () => switchProfileTab("favorites"));
    
    // Melhor suporte para gestos
    videoFeed.addEventListener("touchstart", handleTouchStart, { passive: true });
    videoFeed.addEventListener("touchmove", handleTouchMove, { passive: true });
    videoFeed.addEventListener("touchend", handleTouchEnd);
    videoFeed.addEventListener("wheel", handleWheel, { passive: false });
    videoFeed.addEventListener("click", handleVideoClick);
    videoFeed.addEventListener("dblclick", handleVideoDoubleClick);

    // Inicializar o aplicativo
    async function initApp() {
        // Verificar se o banco de dados está pronto
        if (!window.db || !window.db.db) {
            console.log("Aguardando inicialização do banco de dados...");
            setTimeout(initApp, 100);
            return;
        }

        // Verificar se já existe um usuário
        const users = await window.db.getAll('users');
        if (users.length === 0) {
            // Criar um usuário padrão
            currentUser = await window.db.createUser({
                username: "Usuário",
                avatar: "default-avatar.svg"
            });
            console.log("Usuário padrão criado:", currentUser);
        } else {
            currentUser = users[0];
            console.log("Usuário existente carregado:", currentUser);
        }

        // Carregar pastas do banco de dados
        await loadFolders();
        
        // Carregar vídeos do banco de dados
        await loadVideos();
        
        // Atualizar a interface do perfil
        updateProfileUI();
        
        // Inicializar com a view For You
        switchView("forYou");
    }

    // Carregar pastas do banco de dados
    async function loadFolders() {
        if (!currentUser) return;
        
        const userFolders = await window.db.getUserFolders(currentUser.id);
        folders = {};
        
        for (const folder of userFolders) {
            folders[folder.id] = {
                name: folder.name,
                videos: []
            };
        }
        
        renderFolders();
    }

    // Salvar pastas no banco de dados
    async function saveFolders() {
        if (!currentUser) return;
        
        // Obter todas as pastas existentes do usuário
        const existingFolders = await window.db.getUserFolders(currentUser.id);
        const existingFolderIds = existingFolders.map(f => f.id);
        
        // Criar novas pastas
        for (const [folderId, folderData] of Object.entries(folders)) {
            if (!existingFolderIds.includes(folderId)) {
                await window.db.createFolder({
                    id: folderId,
                    userId: currentUser.id,
                    name: folderData.name
                });
            }
        }
        
        // Atualizar contagem de pastas no perfil
        updateProfileUI();
    }

    // Renderizar pastas na interface
    function renderFolders() {
        foldersGrid.innerHTML = "";
        Object.entries(folders).forEach(([folderId, folderData]) => {
            const folderItem = document.createElement("div");
            folderItem.className = "folder-item";
            folderItem.innerHTML = `
                <img src="folder-icon.svg" alt="Pasta">
                <div>${folderData.name}</div>
                <div class="video-count">${folderData.videos.length} vídeos</div>
            `;
            folderItem.addEventListener("click", () => openFolder(folderId));
            foldersGrid.appendChild(folderItem);
        });
    }

    // Abrir uma pasta
    async function openFolder(folderId) {
        if (!currentUser) return;
        
        // Carregar vídeos da pasta
        const folderVideos = await window.db.getFolderVideos(folderId);
        videos = folderVideos.map(video => video.url);
        
        if (videos.length > 0) {
            currentIndex = Math.floor(Math.random() * videos.length);
        }
        
        switchView("forYou");
        playForYouVideo();
    }

    // Manipular upload de vídeos
    async function handleUpload(event) {
        if (!currentUser) return;
        
        const files = event.target.files;
        const folderName = prompt("Digite o nome da pasta:");
        
        if (!folderName) return;

        // Criar uma nova pasta no banco de dados
        const newFolder = await window.db.createFolder({
            userId: currentUser.id,
            name: folderName
        });
        
        if (!folders[newFolder.id]) {
            folders[newFolder.id] = {
                name: folderName,
                videos: []
            };
        }

        // Processar cada arquivo
        for (let file of files) {
            const url = URL.createObjectURL(file);
            
            // Criar thumbnail (simplificado)
            const thumbnail = await createThumbnail(file);
            
            // Adicionar vídeo ao banco de dados
            const video = await window.db.addVideo({
                userId: currentUser.id,
                folderId: newFolder.id,
                title: file.name,
                url: url,
                thumbnail: thumbnail,
                duration: 0 // Será atualizado quando o vídeo for carregado
            });
            
            // Adicionar à lista de vídeos da pasta
            folders[newFolder.id].videos.push(url);
            
            // Adicionar à lista geral de vídeos
            videos.push(url);
        }

        saveFolders();
        renderFolders();
        updateProfileUI();
        switchView("folders");
    }

    // Criar thumbnail para o vídeo
    function createThumbnail(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.addEventListener('loadeddata', () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg'));
                URL.revokeObjectURL(video.src);
            });
            video.addEventListener('error', () => {
                resolve(null);
            });
        });
    }

    // Carregar vídeos do banco de dados
    async function loadVideos() {
        if (!currentUser) return;
        
        const userVideos = await window.db.getUserVideos(currentUser.id);
        videos = userVideos.map(video => video.url);
        
        // Atualizar a contagem de vídeos no perfil
        updateProfileUI();
    }

    // Alternar entre as views
    function switchView(view) {
        if (view === "forYou") {
            videoFeed.style.display = "block";
            foldersView.style.display = "none";
            profileView.style.display = "none";
            forYouBtn.classList.add("active");
            foldersBtn.classList.remove("active");
            profileBtn.classList.remove("active");
            if (videos.length > 0) {
                playForYouVideo();
            }
        } else if (view === "folders") {
            if (currentVideo) {
                currentVideo.pause();
            }
            videoFeed.style.display = "none";
            foldersView.style.display = "block";
            profileView.style.display = "none";
            foldersBtn.classList.add("active");
            forYouBtn.classList.remove("active");
            profileBtn.classList.remove("active");
        } else if (view === "profile") {
            if (currentVideo) {
                currentVideo.pause();
            }
            videoFeed.style.display = "none";
            foldersView.style.display = "none";
            profileView.style.display = "block";
            profileBtn.classList.add("active");
            forYouBtn.classList.remove("active");
            foldersBtn.classList.remove("active");
            
            // Carregar vídeos do perfil
            loadProfileVideos();
        }
    }

    // Alternar entre as abas do perfil
    function switchProfileTab(tab) {
        if (tab === "videos") {
            profileVideosTab.classList.add("active");
            profileFavoritesTab.classList.remove("active");
            profileVideosGrid.style.display = "grid";
            profileFavoritesGrid.style.display = "none";
        } else if (tab === "favorites") {
            profileVideosTab.classList.remove("active");
            profileFavoritesTab.classList.add("active");
            profileVideosGrid.style.display = "none";
            profileFavoritesGrid.style.display = "grid";
            
            // Carregar vídeos favoritos
            loadProfileFavorites();
        }
    }

    // Carregar vídeos do perfil
    async function loadProfileVideos() {
        if (!currentUser) return;
        
        profileVideosGrid.innerHTML = "";
        
        const userVideos = await window.db.getUserVideos(currentUser.id);
        
        for (const video of userVideos) {
            const videoItem = createVideoItem(video);
            profileVideosGrid.appendChild(videoItem);
        }
    }

    // Carregar vídeos favoritos
    async function loadProfileFavorites() {
        if (!currentUser) return;
        
        profileFavoritesGrid.innerHTML = "";
        
        // Obter vídeos marcados como favoritos pelo usuário
        const favoriteVideos = await window.db.getFavoriteVideos(currentUser.id);
        
        // Obter vídeos favoritados de outros usuários
        const userFavorites = await window.db.getAllByIndex('favorites', 'userId', currentUser.id);
        const favoriteVideoIds = userFavorites.map(f => f.videoId);
        
        for (const videoId of favoriteVideoIds) {
            const video = await window.db.getVideo(videoId);
            if (video) {
                const videoItem = createVideoItem(video);
                profileFavoritesGrid.appendChild(videoItem);
            }
        }
    }

    // Criar item de vídeo para o grid
    function createVideoItem(video) {
        const videoItem = document.createElement("div");
        videoItem.className = "profile-video-item";
        
        // Usar thumbnail se disponível, caso contrário usar um placeholder
        const thumbnail = video.thumbnail || "video-placeholder.png";
        
        videoItem.innerHTML = `
            <img src="${thumbnail}" alt="${video.title}">
            <div class="video-duration">${formatTime(video.duration)}</div>
            <div class="favorite-icon">${video.favorite ? '❤️' : ''}</div>
        `;
        
        // Adicionar evento de clique para reproduzir o vídeo
        videoItem.addEventListener("click", () => {
            // Encontrar o índice do vídeo na lista geral
            const index = videos.indexOf(video.url);
            if (index !== -1) {
                currentIndex = index;
                switchView("forYou");
                playForYouVideo();
            } else {
                // Se o vídeo não estiver na lista geral, adicioná-lo
                videos.push(video.url);
                currentIndex = videos.length - 1;
                switchView("forYou");
                playForYouVideo();
            }
        });
        
        return videoItem;
    }

    // Atualizar a interface do perfil
    async function updateProfileUI() {
        if (!currentUser) return;
        
        // Atualizar informações do usuário
        profileUsername.textContent = currentUser.username;
        profileAvatarImg.src = currentUser.avatar;
        
        // Atualizar contagens
        const userVideos = await window.db.getUserVideos(currentUser.id);
        const userFolders = await window.db.getUserFolders(currentUser.id);
        
        profileVideosCount.textContent = userVideos.length;
        profileFoldersCount.textContent = userFolders.length;
    }

    // Manipular toque inicial
    function handleTouchStart(event) {
        if (isTransitioning) return;
        
        touchStartY = event.touches[0].clientY;
        touchStartX = event.touches[0].clientX;
        touchStartTime = Date.now();
        isScrolling = false;
        isHorizontalScroll = false;
        
        // Verificar se é um duplo toque
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTapTime;
        const tapDistance = Math.sqrt(
            Math.pow(touchStartX - lastTapX, 2) + 
            Math.pow(touchStartY - lastTapY, 2)
        );
        
        if (tapLength < 300 && tapDistance < 20) {
            // É um duplo toque
            handleVideoDoubleClick();
            event.preventDefault();
            return;
        }
        
        lastTapTime = currentTime;
        lastTapX = touchStartX;
        lastTapY = touchStartY;
    }

    // Manipular movimento do toque
    function handleTouchMove(event) {
        if (isTransitioning) return;
        
        const currentY = event.touches[0].clientY;
        const currentX = event.touches[0].clientX;
        const deltaY = currentY - touchStartY;
        const deltaX = currentX - touchStartX;
        
        // Determinar se é um scroll horizontal ou vertical
        if (!isHorizontalScroll && !isScrolling) {
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                isHorizontalScroll = true;
                isSeeking = true;
                seekStartX = currentX;
                seekStartTime = currentVideo ? currentVideo.currentTime : 0;
            } else if (Math.abs(deltaY) > 10) {
                isScrolling = true;
            }
        }
        
        if (isSeeking && currentVideo) {
            // Controlar a timeline do vídeo com blocos de 30 segundos
            const videoDuration = currentVideo.duration;
            const videoWidth = currentVideo.offsetWidth;
            const seekPercentage = deltaX / videoWidth;
            
            // Calcular quantos blocos de 30 segundos foram percorridos
            const blocksMoved = Math.round(seekPercentage * (videoDuration / seekBlockSize));
            const newTime = Math.max(0, Math.min(seekStartTime + (blocksMoved * seekBlockSize), videoDuration));
            
            currentVideo.currentTime = newTime;
            
            // Mostrar indicador de progresso
            showSeekIndicator(newTime, videoDuration, blocksMoved);
        } else if (isScrolling) {
            // Aplicar transformação ao vídeo atual
            if (currentVideo) {
                const transform = `translateY(${deltaY}px)`;
                currentVideo.style.transform = transform;
                currentVideo.style.transition = 'none';
            }
        }
    }

    // Mostrar indicador de seek
    function showSeekIndicator(currentTime, duration, blocksMoved) {
        // Remover indicador anterior se existir
        const existingIndicator = document.querySelector('.seek-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Criar novo indicador
        const indicator = document.createElement('div');
        indicator.className = 'seek-indicator';
        
        const progress = (currentTime / duration) * 100;
        const timeText = formatTime(currentTime) + ' / ' + formatTime(duration);
        const directionText = blocksMoved > 0 ? 'Avançar' : blocksMoved < 0 ? 'Retroceder' : '';
        const blocksText = Math.abs(blocksMoved) > 0 ? `${Math.abs(blocksMoved)} blocos` : '';
        
        indicator.innerHTML = `
            <div class="seek-progress" style="width: ${progress}%"></div>
            <div class="seek-time">${timeText}</div>
            <div class="seek-direction">${directionText} ${blocksText}</div>
        `;
        
        videoFeed.appendChild(indicator);
        
        // Remover indicador após 1 segundo
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, 1000);
    }

    // Formatar tempo em segundos para mm:ss
    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Manipular fim do toque
    function handleTouchEnd(event) {
        if (isTransitioning) return;
        
        touchEndY = event.changedTouches[0].clientY;
        touchEndX = event.changedTouches[0].clientX;
        const touchDuration = Date.now() - touchStartTime;
        const deltaY = touchEndY - touchStartY;
        const deltaX = touchEndX - touchStartX;
        
        // Verificar se é um clique simples
        if (!isScrolling && !isHorizontalScroll && touchDuration < 300 && Math.abs(deltaY) < 10 && Math.abs(deltaX) < 10) {
            toggleVideoMute();
            return;
        }
        
        if (isSeeking) {
            // Finalizar o seek
            hideSeekIndicator();
            isSeeking = false;
        } else if (Math.abs(deltaY) > 100) {
            handleSwipe();
        } else {
            resetVideoPosition();
        }
        
        isHorizontalScroll = false;
        isScrolling = false;
    }

    // Esconder indicador de seek
    function hideSeekIndicator() {
        const indicator = document.querySelector('.seek-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // Manipular clique no vídeo
    function handleVideoClick(event) {
        // Prevenir que o clique simples seja acionado após um duplo clique
        if (Date.now() - lastTapTime < 300) return;
        
        toggleVideoMute();
    }

    // Manipular duplo clique no vídeo
    function handleVideoDoubleClick() {
        toggleVideoPlayback();
    }

    // Alternar mudo do vídeo
    function toggleVideoMute() {
        if (currentVideo) {
            currentVideo.muted = !currentVideo.muted;
            
            // Mostrar indicador de mudo
            showMuteIndicator(currentVideo.muted);
        }
    }

    // Mostrar indicador de mudo
    function showMuteIndicator(isMuted) {
        // Remover indicador anterior se existir
        const existingIndicator = document.querySelector('.mute-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Criar novo indicador
        const indicator = document.createElement('div');
        indicator.className = 'mute-indicator';
        indicator.innerHTML = isMuted ? '🔇' : '🔊';
        
        videoFeed.appendChild(indicator);
        
        // Remover indicador após 1 segundo
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, 1000);
    }

    // Resetar posição do vídeo
    function resetVideoPosition() {
        if (currentVideo) {
            currentVideo.style.transform = 'translateY(0)';
            currentVideo.style.transition = 'transform 0.3s ease-out';
        }
    }

    // Alternar reprodução do vídeo
    function toggleVideoPlayback() {
        if (currentVideo) {
            if (currentVideo.paused) {
                currentVideo.play();
            } else {
                currentVideo.pause();
            }
            
            // Mostrar indicador de play/pause
            showPlayPauseIndicator(!currentVideo.paused);
        }
    }

    // Mostrar indicador de play/pause
    function showPlayPauseIndicator(isPlaying) {
        // Remover indicador anterior se existir
        const existingIndicator = document.querySelector('.play-pause-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Criar novo indicador
        const indicator = document.createElement('div');
        indicator.className = 'play-pause-indicator';
        indicator.innerHTML = isPlaying ? '▶️' : '⏸️';
        
        videoFeed.appendChild(indicator);
        
        // Remover indicador após 1 segundo
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, 1000);
    }

    // Manipular rolagem da roda do mouse
    function handleWheel(event) {
        if (isTransitioning) return;
        event.preventDefault();
        
        if (event.deltaY > 0) {
            nextVideo();
        } else {
            previousVideo();
        }
    }

    // Manipular swipe
    function handleSwipe() {
        const diff = touchStartY - touchEndY;
        if (Math.abs(diff) > 100) { // Aumentado o threshold para swipe
            if (diff > 0) {
                nextVideo();
            } else {
                previousVideo();
            }
        } else {
            resetVideoPosition();
        }
    }

    // Próximo vídeo
    function nextVideo() {
        if (isTransitioning || videos.length <= 1) return;
        currentIndex = (currentIndex + 1) % videos.length;
        playForYouVideo('up');
    }

    // Vídeo anterior
    function previousVideo() {
        if (isTransitioning || videos.length <= 1) return;
        currentIndex = (currentIndex - 1 + videos.length) % videos.length;
        playForYouVideo('down');
    }

    // Reproduzir vídeo na página For You
    function playForYouVideo(direction = null) {
        if (videos.length === 0 || isTransitioning) return;

        isTransitioning = true;

        const oldVideo = currentVideo;
        const newVideoContainer = document.createElement('div');
        newVideoContainer.className = 'video-wrapper';
        
        const videoElement = document.createElement("video");
        videoElement.src = videos[currentIndex];
        videoElement.autoplay = true;
        videoElement.muted = false;
        videoElement.controls = false;
        videoElement.loop = false;
        videoElement.playsInline = true;
        videoElement.style.width = "100%";
        videoElement.style.height = "100%";
        videoElement.style.objectFit = "contain";

        if (direction) {
            const startPos = direction === 'up' ? '100%' : '-100%';
            newVideoContainer.style.transform = `translateY(${startPos})`;
            if (oldVideo) {
                oldVideo.parentElement.style.transform = `translateY(${direction === 'up' ? '-100%' : '100%'})`;
                oldVideo.parentElement.style.transition = 'transform 0.3s ease-out';
            }
        }

        newVideoContainer.appendChild(videoElement);
        videoFeed.appendChild(newVideoContainer);

        // Aguardar um frame para aplicar a transição
        requestAnimationFrame(() => {
            newVideoContainer.style.transform = 'translateY(0)';
            newVideoContainer.style.transition = 'transform 0.3s ease-out';
        });

        videoElement.addEventListener("loadedmetadata", () => {
            videoElement.play().catch(console.error);
        });

        // Limpar vídeo antigo após a transição
        setTimeout(() => {
            if (oldVideo && oldVideo.parentElement) {
                oldVideo.parentElement.remove();
            }
            isTransitioning = false;
        }, 300);

        currentVideo = videoElement;

        videoElement.addEventListener("ended", () => {
            nextVideo();
        });
    }

    // Adicionar suporte para teclas de seta para navegar nos blocos de tempo
    document.addEventListener('keydown', (event) => {
        if (!currentVideo) return;
        
        if (event.key === 'ArrowLeft') {
            // Retroceder um bloco
            const newTime = Math.max(0, currentVideo.currentTime - seekBlockSize);
            currentVideo.currentTime = newTime;
            showSeekIndicator(newTime, currentVideo.duration, -1);
        } else if (event.key === 'ArrowRight') {
            // Avançar um bloco
            const newTime = Math.min(currentVideo.duration, currentVideo.currentTime + seekBlockSize);
            currentVideo.currentTime = newTime;
            showSeekIndicator(newTime, currentVideo.duration, 1);
        }
    });
});
