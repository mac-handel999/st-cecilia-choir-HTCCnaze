const slide = document.getElementById('carousel-slide');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

let counter = 0;
let images = [];

// 1. Fetch images from JSON
fetch('image-gallery.json')
    .then(response => response.json())
    .then(data => {
        images = data;
        data.forEach(img => {
            const imageElement = document.createElement('img');
            imageElement.src = img.url;
            imageElement.alt = img.caption || 'Roadmap Image';
            imageElement.style.width = '590px';
            imageElement.style.height = '590px';
            imageElement.style.objectFit = 'center';
            slide.appendChild(imageElement);
        });
    });

// 2. Function to move slide
function updateSlide() {
    const size = slide.children[0].clientWidth;
    slide.style.transform = 'translateX(' + (-size * counter) + 'px)';
}

// 3. Next/Prev Button Logic
nextBtn.addEventListener('click', () => {
    if (counter >= images.length - 1) counter = -1;
    counter++;
    updateSlide();
});

prevBtn.addEventListener('click', () => {
    if (counter <= 0) counter = images.length;
    counter--;
    updateSlide();
});

// 4. Automatic Animation (Change every 3 seconds)
setInterval(() => {
    nextBtn.click();
}, 3000);


/* for the image scroll effect with Marquee Html element  */


const marquee = document.getElementById('marquee-content');

fetch('image-gallery.json')
    .then(res => res.json())
    .then(data => {
        // Create a function to add images to the DOM
        const renderImages = (list) => {
            list.forEach(item => {
                const img = document.createElement('img');
                img.src = item.url;
                img.alt = "St. Cecilia Choir";
                marquee.appendChild(img);
            });
        };

        // Render once...
        renderImages(data);
        // ...and render again immediately after to create the loop
        renderImages(data);
    })
    .catch(err => console.error("Error loading choir images:", err));