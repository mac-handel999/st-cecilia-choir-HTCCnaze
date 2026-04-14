let allExecs = [];
const grid = document.getElementById('execGrid');
const searchInput = document.getElementById('execSearch');

// 1. Fetch Data
fetch('executives.json')
    .then(res => res.json())
    .then(data => {
        allExecs = data;
        displayExecs(allExecs); // Display all on load
    });

// 2. Display Function
function displayExecs(data) {
    grid.innerHTML = ""; // Clear current grid
    data.forEach(person => {
        const card = `
            <div class="exec-card">
                <img src="${person.image}" class="exec-image" alt="${person.name}">
                <h4>${person.position}:</h4>
                <p>${person.name}</p>
                <span>${person.contact}</span>
            </div>
        `;
        grid.innerHTML += card;
    });
}

// 3. Search Logic
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allExecs.filter(person => 
        person.name.toLowerCase().includes(term) || 
        person.position.toLowerCase().includes(term)
    );
    displayExecs(filtered);
});