
// Corrected JavaScript for menu section
document.addEventListener('DOMContentLoaded', function() {
  const menuBtn = document.getElementById('menu-btn');
  const menuSelection = document.getElementById('menu-selection');
  const menuIcon = document.getElementById('menu-icon');

  // Event listener for the menu button click
  menuBtn.addEventListener('click', function() {
    // Check if the menu is currently visible (has the 'show' class)
    if (menuSelection.classList.contains('show')) {
      // If it's visible, hide it and change the icon back to the hamburger
      menuSelection.classList.remove('show');
      menuIcon.src = ' /icons/Hamburger_icon.svg.png';
      menuIcon.alt = 'Menu';
    } else {
      // If it's not visible, show it and change the icon to the cancel symbol
      menuSelection.classList.add('show');
      menuIcon.src = ' /icons/cancel-icon.png';
      menuIcon.alt = 'Close';
    };
  })
  
});

// for donate button , to hide or show the account number for donation
   
    const p = document.querySelector('.acctno');
        
    const donateBtn  = document.querySelector('.donate');

  donateBtn.addEventListener('click', () => {
    
    if (p.innerHTML === " ") {
      p.innerHTML ="<strong>St.Cecilia Choir Group HTCC,</br> 1234567891011,</br>G.T Bank </strong>";
      p.style.fontSize = "20px";
      p.style.fontWeight = "bold";
      p.style.color = "#fff";
    } else {
      p.innerHTML = " ";
    }

   });


   //for the video at the hero section 

   const video = document.getElementById('hero-video');
const muteBtn = document.getElementById('mute-toggle');
const muteIcon = document.getElementById('mute-icon');

muteBtn.addEventListener('click', () => {
    if (video.muted) {
        video.muted = false;
        muteIcon.classList.remove('fa-volume-mute');
        muteIcon.classList.add('fa-volume-up');
    } else {
        video.muted = true;
        muteIcon.classList.remove('fa-volume-up');
        muteIcon.classList.add('fa-volume-mute');
    }
});




// For Choir practice section


document.addEventListener("DOMContentLoaded", function() {
    const days = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
    const todayName = days[new Date().getDay()];
    
    // Find all day tags and highlight the one that matches today
    const dayTags = document.querySelectorAll('.day-tag');
    
    dayTags.forEach(tag => {
        if (tag.innerText === todayName) {
            tag.style.background = "#ffd700"; // Change to Gold
            tag.style.color = "#5a0000";      // Change text to Red
            tag.innerHTML += " (Today!)";
        }
    });
});




// for hero animation section

const container = document.getElementById('music-animation-container');
// Using standard emojis so it works even without FontAwesome
const notes = ['♩', '♪', '♫', '♬', '♭', '♮', '♯']; 

function createNote() {
    const note = document.createElement('div');
    note.style.position = 'absolute';
    note.style.bottom = '-50px';
    note.style.color = 'rgba(255, 255, 255, 0.5)'; // White notes
    note.style.fontSize = Math.random() * 20 + 20 + 'px';
    note.style.left = Math.random() * 100 + 'vw';
    note.style.animation = `floatUp ${Math.random() * 3 + 4}s linear forwards`;
    note.style.pointerEvents = 'none';
    note.style.zIndex = '5';
    
    note.innerText = notes[Math.floor(Math.random() * notes.length)];

    container.appendChild(note);

    // Clean up
    setTimeout(() => {
        note.remove();
    }, 7000);
}

// Start creating notes
setInterval(createNote, 600);














/*

//for the resourses  & search section page

//const  Url = "Resources.json";
let allResources = [];

const searchInput = document.getElementById("search");
const searchBtn = document.getElementById("searchBtn");
const container = document.getElementById("resource-container");

// Load data from JSON file
fetch('Resources.json ')
  .then(res => res.json())
  .then(data => {
    allResources = data;
  })
  .catch(err => {
    console.error("Failed to load resources:", err);
  });

function displayResources(filteredResources) {
  container.innerHTML = "";

  if (filteredResources.length === 0) {
    container.innerHTML = "<p>No results found.</p>";
    return;
  }

  filteredResources.forEach(resource => {
    const card = document.createElement("div");
    card.className = "resource-card";
    card.innerHTML = `
            <img src="${resource.image}" alt="${resource.title}" width ="180px" height ="180px" style = "border-radius:20px; display:flex; flex-wrap:wrap;
        align-items:center; justify-content:center; text-align:center;"/>
      <h1 class="title-header">${resource.title}</h1>
      <p><strong>Type:</strong> ${resource.type}</p>
      <p><strong>Platform:</strong> ${resource.platform}</p>
      <p><strong>Category:</strong> ${resource.category}</p>
      <a href="${resource.link}" target="_blank" class="view-live"
     }>VIEW RESOURCE LIVE</a>
    `;
    container.appendChild(card);
  });
}

// Search logic when button is clicked
searchBtn.addEventListener("click", () => {
  const keyword = searchInput.value.trim().toLowerCase();
  if (keyword === "") {
    container.innerHTML = "<p>Please enter a search term.</p>";
    return;
  }

  const filtered = allResources.filter(r =>
    r.title.toLowerCase().includes(keyword) ||
    r.category.toLowerCase().includes(keyword)
  );

  displayResources(filtered);
}); 


//for road map images

const imageShow = document.getElementById('roadmapImg');
const btn = document.querySelector('.roadmapBtn');



btn.addEventListener("click", () => {
  
  if (btn.innerText == "Show Roadmap Images") {
    btn.innerText = "Hide Roadmap Images";
    
    imageShow.style.display = "block"
  } else {
    btn.innerText = "Show Roadmap Images";
    
    imageShow.style.display = "none";
  }
})

});

*/