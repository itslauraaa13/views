document.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("app");
    const videoFeed = document.getElementById("video-feed");
    const foldersView = document.getElementById("folders-view");
    const uploadBtn = document.getElementById("uploadBtn");
    const videoUpload = document.getElementById("videoUpload");
    const forYouBtn = document.getElementById("forYouBtn");
    const foldersBtn = document.getElementById("foldersBtn");
    const foldersGrid = document.querySelector(".folders-grid");

    let videos = [];
    let currentIndex = 0;
    let folders = {};
    let touchStartY = 0;
    let touchEndY = 0;
    let isScrolling = false;
    let touchStartTime = 0;
    let currentVideo = null;
    let isTransitioning = false;

    // Prevenir comportamento padrão de scroll/gestos
    app.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // Carregar pastas do localStorage
    loadFolders();

    // Event Listeners
    uploadBtn.addEventListener("click", () => videoUpload.click());
    forYouBtn.addEventListener("click", () => switchView("forYou"));
    foldersBtn.addEventListener("click", () => switchView("folders"));
    videoUpload.addEventListener("change", handleUpload);
    
    // Melhor suporte para gestos
    videoFeed.addEventListener("touchstart", handleTouchStart, { passive: true });
    videoFeed.addEventListener("touchmove", handleTouchMove, { passive: true });
    videoFeed.addEventListener("touchend", handleTouchEnd);
    videoFeed.addEventListener("wheel", handleWheel, { passive: false });

    function loadFolders() {
        const savedFolders = localStorage.getItem("folders");
        if (savedFolders) {
            folders = JSON.parse(savedFolders);
            renderFolders();
        }
    }

    function saveFolders() {
        localStorage.setItem("folders", JSON.stringify(folders));
    }

    function renderFolders() {
        foldersGrid.innerHTML = "";
        Object.keys(folders).forEach(folderName => {
            const folderItem = document.createElement("div");
            folderItem.className = "folder-item";
            folderItem.innerHTML = `
                <img src="folder-icon.svg" alt="Pasta">
                <div>${folderName}</div>
                <div class="video-count">${folders[folderName].length} vídeos</div>
            `;
            folderItem.addEventListener("click", () => openFolder(folderName));
            foldersGrid.appendChild(folderItem);
        });
    }

    function openFolder(folderName) {
        videos = folders[folderName];
        if (videos.length > 0) {
            currentIndex = Math.floor(Math.random() * videos.length);
        }
        switchView("forYou");
        playForYouVideo();
    }

    function handleUpload(event) {
        const files = event.target.files;
        const folderName = prompt("Digite o nome da pasta:");
        
        if (!folderName) return;

        if (!folders[folderName]) {
            folders[folderName] = [];
        }

        for (let file of files) {
            const url = URL.createObjectURL(file);
            folders[folderName].push(url);
        }

        saveFolders();
        renderFolders();
        switchView("folders");
    }

    function switchView(view) {
        if (view === "forYou") {
            videoFeed.style.display = "block";
            foldersView.style.display = "none";
            forYouBtn.classList.add("active");
            foldersBtn.classList.remove("active");
            if (videos.length > 0) {
                playForYouVideo();
            }
        } else {
            if (currentVideo) {
                currentVideo.pause();
            }
            videoFeed.style.display = "none";
            foldersView.style.display = "block";
            foldersBtn.classList.add("active");
            forYouBtn.classList.remove("active");
        }
    }

    function handleTouchStart(event) {
        if (isTransitioning) return;
        touchStartY = event.touches[0].clientY;
        touchStartTime = Date.now();
        isScrolling = false;
    }

    function handleTouchMove(event) {
        if (isTransitioning) return;
        const currentY = event.touches[0].clientY;
        const deltaY = currentY - touchStartY;
        
        if (Math.abs(deltaY) > 10) {
            isScrolling = true;
            
            // Aplicar transformação ao vídeo atual
            if (currentVideo) {
                const transform = `translateY(${deltaY}px)`;
                currentVideo.style.transform = transform;
                currentVideo.style.transition = 'none';
            }
        }
    }

    function handleTouchEnd(event) {
        if (isTransitioning) return;
        
        touchEndY = event.changedTouches[0].clientY;
        const touchDuration = Date.now() - touchStartTime;
        const deltaY = touchEndY - touchStartY;
        
        if (!isScrolling && touchDuration < 300) {
            toggleVideoPlayback();
            resetVideoPosition();
        } else if (Math.abs(deltaY) > 100) {
            handleSwipe();
        } else {
            resetVideoPosition();
        }
    }

    function resetVideoPosition() {
        if (currentVideo) {
            currentVideo.style.transform = 'translateY(0)';
            currentVideo.style.transition = 'transform 0.3s ease-out';
        }
    }

    function toggleVideoPlayback() {
        if (currentVideo) {
            if (currentVideo.paused) {
                currentVideo.play();
            } else {
                currentVideo.pause();
            }
        }
    }

    function handleWheel(event) {
        if (isTransitioning) return;
        event.preventDefault();
        
        if (event.deltaY > 0) {
            nextVideo();
        } else {
            previousVideo();
        }
    }

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

    function nextVideo() {
        if (isTransitioning || videos.length <= 1) return;
        currentIndex = (currentIndex + 1) % videos.length;
        playForYouVideo('up');
    }

    function previousVideo() {
        if (isTransitioning || videos.length <= 1) return;
        currentIndex = (currentIndex - 1 + videos.length) % videos.length;
        playForYouVideo('down');
    }

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

    // Inicializar com a view For You
    switchView("forYou");
});

document.addEventListener("DOMContentLoaded", async () => {
    const videoFeed = document.getElementById("video-feed");
    const response = await fetch("uploads/videos.json"); // Arquivo com a lista de vídeos
    const videos = await response.json();

    videos.forEach(videoName => {
        const videoElement = document.createElement("video");
        videoElement.src = `uploads/${videoName}`;
        videoElement.controls = true;
        videoElement.style.width = "100%";
        videoElement.style.height = "100%";
        videoFeed.appendChild(videoElement);
    });
});

document.addEventListener("DOMContentLoaded", async () => {
    const videoFeed = document.getElementById("video-feed");

    try {
        const response = await fetch("videos.json"); // Carrega a lista de vídeos
        if (!response.ok) throw new Error("Erro ao carregar lista de vídeos");

        const videos = await response.json();

        videos.forEach(videoName => {
            const videoElement = document.createElement("video");
            videoElement.src = `uploads/${videoName}`;
            videoElement.controls = true;
            videoElement.style.width = "100%";
            videoElement.style.height = "100%";
            videoFeed.appendChild(videoElement);
        });
    } catch (error) {
        console.error("Erro carregando vídeos:", error);
    }
});
