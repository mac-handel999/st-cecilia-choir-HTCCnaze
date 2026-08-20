if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const grid = document.getElementById('gallery-grid');
  const modal = document.getElementById('gallery-modal');
  const modalImg = document.getElementById('gallery-modal-img');

  if (!grid) return;

  grid.innerHTML = '<div class="spinner"></div>';

  let galleryData = [];
  let imageJsonData = [];
  let videoData = [];

  function render(list) {
    if (list.length === 0) {
      showEmpty('gallery-grid', 'No images', 'Gallery coming soon');
      return;
    }

    grid.innerHTML = list.map(item => `
      <div class="gallery-item" onclick="openGalleryModal('${escapeHtml(item.image_url || item.url)}')">
        <img src="${escapeHtml(item.image_url || item.url)}" alt="${escapeHtml(item.title || item.caption || 'Gallery image')}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);\\'>No image</div>'">
      </div>
    `).join('');
  }

  // Load API gallery data
  try {
    const { data, error } = await api.get('/gallery?select=*&order=created_at&ascending=false');
    if (error) throw new Error(error.message || 'Request failed');
    galleryData = data || [];
    render(galleryData);
  } catch (error) {
    showEmpty('gallery-grid', 'Error', error.message);
  }

  // Load image-gallery.json for marquee and carousel
  try {
    const res = await fetch('data/image-gallery.json');
    imageJsonData = await res.json();
  } catch (err) {
    console.error('Failed to load image-gallery.json:', err);
    imageJsonData = [];
  }

  // Load videos.json for video carousel
  try {
    const res = await fetch('data/videos.json');
    videoData = await res.json();
  } catch (err) {
    console.error('Failed to load videos.json:', err);
    videoData = [];
  }

  // Marquee
  const marqueeContent = document.getElementById('marquee-content');
  if (marqueeContent && imageJsonData.length > 0) {
    const items = imageJsonData.map(item => `
      <div style="flex-shrink: 0; width: 200px; margin-right: 1rem;">
        <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.caption || '')}" style="width: 100%; height: 150px; object-fit: cover; border-radius: var(--radius-lg);" loading="lazy" onerror="this.style.display='none'">
      </div>
    `).join('');
    marqueeContent.innerHTML = `
      <div style="display: flex; animation: marquee 30s linear infinite; width: max-content;">
        ${items}${items}
      </div>
    `;
  }

  // Image Carousel
  const carouselTrack = document.getElementById('carousel-track');
  const carouselDots = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');

  if (carouselTrack && imageJsonData.length > 0) {
    let currentSlide = 0;
    const totalSlides = imageJsonData.length;

    carouselTrack.innerHTML = imageJsonData.map(item => `
      <div style="min-width: 100%; height: 400px;">
        <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.caption || '')}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy" onerror="this.style.display='none'">
      </div>
    `).join('');

    if (carouselDots) {
      carouselDots.innerHTML = imageJsonData.map((_, i) => `
        <button class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>
      `).join('');
    }

    function updateCarousel() {
      carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
      if (carouselDots) {
        carouselDots.querySelectorAll('.carousel-dot').forEach((dot, i) => {
          dot.classList.toggle('active', i === currentSlide);
        });
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
        updateCarousel();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentSlide = (currentSlide + 1) % totalSlides;
        updateCarousel();
      });
    }

    if (carouselDots) {
      carouselDots.querySelectorAll('.carousel-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          currentSlide = parseInt(dot.dataset.index);
          updateCarousel();
        });
      });
    }

    setInterval(() => {
      currentSlide = (currentSlide + 1) % totalSlides;
      updateCarousel();
    }, 4000);
  }

  // Video Carousel
  const videoTrack = document.getElementById('video-track');
  const videoDots = document.getElementById('video-dots');
  const videoPrev = document.getElementById('video-prev');
  const videoNext = document.getElementById('video-next');
  const videoMuteBtn = document.getElementById('video-mute-btn');
  const videoPlayBtn = document.getElementById('video-play-btn');

  if (videoTrack && videoData.length > 0) {
    let currentVideo = 0;
    let isMuted = false;
    const totalVideos = videoData.length;

    videoTrack.innerHTML = videoData.map(item => `
      <div style="min-width: 100%; height: 400px; display: flex; align-items: center; justify-content: center; background: #000; position: relative;">
        <video src="${escapeHtml(item.url)}" title="${escapeHtml(item.title || 'Video')}" controlsList="nodownload" style="width: 100%; height: 100%; object-fit: contain;" preload="metadata"></video>
      </div>
    `).join('');

    if (videoDots) {
      videoDots.innerHTML = videoData.map((_, i) => `
        <button class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>
      `).join('');
    }

    function updateVideoCarousel() {
      videoTrack.style.transform = `translateX(-${currentVideo * 100}%)`;
      const video = videoTrack.querySelector('video');
      if (video) {
        video.muted = isMuted;
      }
      if (videoDots) {
        videoDots.querySelectorAll('.carousel-dot').forEach((dot, i) => {
          dot.classList.toggle('active', i === currentVideo);
        });
      }
    }

    if (videoPrev) {
      videoPrev.addEventListener('click', () => {
        currentVideo = (currentVideo - 1 + totalVideos) % totalVideos;
        updateVideoCarousel();
      });
    }

    if (videoNext) {
      videoNext.addEventListener('click', () => {
        currentVideo = (currentVideo + 1) % totalVideos;
        updateVideoCarousel();
      });
    }

    if (videoDots) {
      videoDots.querySelectorAll('.carousel-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          currentVideo = parseInt(dot.dataset.index);
          updateVideoCarousel();
        });
      });
    }

    if (videoMuteBtn) {
      videoMuteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        videoMuteBtn.innerHTML = isMuted
          ? '<span class="material-symbols-outlined">volume_off</span><span>Unmute</span>'
          : '<span class="material-symbols-outlined">volume_up</span><span>Mute</span>';
      });
    }

    if (videoPlayBtn) {
      videoPlayBtn.addEventListener('click', () => {
        const video = videoTrack.querySelector('video');
        if (video) {
          if (video.paused) {
            video.play();
            videoPlayBtn.style.display = 'none';
          } else {
            video.pause();
            videoPlayBtn.style.display = 'flex';
          }
        }
      });

      const video = videoTrack.querySelector('video');
      if (video) {
        video.addEventListener('play', () => {
          videoPlayBtn.style.display = 'none';
        });
        video.addEventListener('pause', () => {
          videoPlayBtn.style.display = 'flex';
        });
        video.addEventListener('ended', () => {
          videoPlayBtn.style.display = 'flex';
        });
      }
    }
  }
});

function openGalleryModal(url) {
  const modal = document.getElementById('gallery-modal');
  const modalImg = document.getElementById('gallery-modal-img');
  if (modal && modalImg) {
    modalImg.src = url;
    modal.classList.add('active');
  }
}
