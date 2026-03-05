/* ============================================================
   SoupColor — script.js
   Color detection (Canvas API) → Soup suggestion
   ============================================================ */

// ──── DOM refs ────
const dropZone      = document.getElementById('drop-zone');
const fileInput      = document.getElementById('file-input');
const uploadSection  = document.getElementById('upload-section');
const resultSection  = document.getElementById('result-section');
const previewImg     = document.getElementById('preview-img');
const colorCanvas    = document.getElementById('color-canvas');
const colorPalette   = document.getElementById('color-palette');
const colorNames     = document.getElementById('color-names');
const soupName       = document.getElementById('soup-name');
const soupDesc       = document.getElementById('soup-description');
const ingredientsList = document.getElementById('ingredients-list');
const soupColorBar   = document.getElementById('soup-color-bar');
const btnReset       = document.getElementById('btn-reset');

// ──── Events: upload ────
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

btnReset.addEventListener('click', () => {
    resultSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    fileInput.value = '';
});

// ──── Handle uploaded file ────
function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
    }

    // Show loading
    const loader = document.createElement('div');
    loader.className = 'loading-overlay';
    loader.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loader);

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            previewImg.src = e.target.result;
            const colors = extractColors(img, 5);
            const soup   = matchSoup(colors);
            renderColors(colors);
            renderSoup(soup, colors);

            uploadSection.classList.add('hidden');
            resultSection.classList.remove('hidden');

            loader.remove();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ──── Color extraction (k-means-ish quantization) ────
function extractColors(img, k) {
    const ctx = colorCanvas.getContext('2d');
    // Down-sample for speed
    const MAX = 150;
    const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    colorCanvas.width  = w;
    colorCanvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        // Skip near-transparent
        if (data[i + 3] < 128) continue;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
    }

    if (!pixels.length) return [[128, 128, 128]];

    // Simple k-means
    let centroids = [];
    for (let i = 0; i < k; i++) {
        centroids.push(pixels[Math.floor(Math.random() * pixels.length)].slice());
    }

    for (let iter = 0; iter < 10; iter++) {
        const clusters = centroids.map(() => []);
        pixels.forEach(px => {
            let minD = Infinity, best = 0;
            centroids.forEach((c, ci) => {
                const d = (px[0]-c[0])**2 + (px[1]-c[1])**2 + (px[2]-c[2])**2;
                if (d < minD) { minD = d; best = ci; }
            });
            clusters[best].push(px);
        });

        centroids = clusters.map((cl, ci) => {
            if (!cl.length) return centroids[ci];
            const avg = [0, 0, 0];
            cl.forEach(px => { avg[0] += px[0]; avg[1] += px[1]; avg[2] += px[2]; });
            return avg.map(v => Math.round(v / cl.length));
        });
    }

    // Sort by frequency (cluster size)
    const counts = centroids.map(() => 0);
    pixels.forEach(px => {
        let minD = Infinity, best = 0;
        centroids.forEach((c, ci) => {
            const d = (px[0]-c[0])**2 + (px[1]-c[1])**2 + (px[2]-c[2])**2;
            if (d < minD) { minD = d; best = ci; }
        });
        counts[best]++;
    });

    const indexed = centroids.map((c, i) => ({ c, count: counts[i] }));
    indexed.sort((a, b) => b.count - a.count);

    return indexed.map(x => x.c);
}

// ──── Named colour mapping ────
function colorDistance(a, b) {
    return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

const COLOR_MAP = [
    { name: 'Red',        rgb: [200, 50, 50]   },
    { name: 'Orange',     rgb: [230, 140, 30]  },
    { name: 'Yellow',     rgb: [230, 210, 50]  },
    { name: 'Green',      rgb: [60, 160, 60]   },
    { name: 'Dark Green', rgb: [30, 90, 30]    },
    { name: 'Blue',       rgb: [50, 100, 200]  },
    { name: 'Purple',     rgb: [130, 50, 150]  },
    { name: 'Pink',       rgb: [220, 120, 160] },
    { name: 'Brown',      rgb: [130, 80, 40]   },
    { name: 'Beige',      rgb: [210, 190, 160] },
    { name: 'White',      rgb: [240, 240, 240] },
    { name: 'Grey',       rgb: [140, 140, 140] },
    { name: 'Black',      rgb: [30, 30, 30]    },
    { name: 'Cream',      rgb: [255, 250, 220] },
];

function closestColorName(rgb) {
    let best = COLOR_MAP[0], bestD = Infinity;
    COLOR_MAP.forEach(c => {
        const d = colorDistance(rgb, c.rgb);
        if (d < bestD) { bestD = d; best = c; }
    });
    return best.name;
}

// ──── Soup database ────
const SOUPS = [
    // ── Reds ──────────────────────────────────────────
    {
        name: 'Classic Tomato Soup',
        matches: ['Red', 'Orange'],
        priority: ['Red'],
        description: 'A rich and velvety tomato soup, bursting with the warm flavours of ripe tomatoes, roasted red peppers and a hint of basil.',
        ingredients: [
            { name: 'Ripe tomatoes',    color: '#d63030' },
            { name: 'Red bell pepper',  color: '#c0392b' },
            { name: 'Garlic',           color: '#f0e6d3' },
            { name: 'Onion',            color: '#f5e0b0' },
            { name: 'Fresh basil',      color: '#3da53d' },
            { name: 'Olive oil',        color: '#c5b94e' },
        ]
    },
    {
        name: 'Roasted Red Pepper Soup',
        matches: ['Red', 'Orange', 'Black'],
        priority: ['Red', 'Black'],
        description: 'Charred red peppers and smoky paprika give this vibrant soup its deep ruby colour and rich, warming depth of flavour.',
        ingredients: [
            { name: 'Red bell peppers', color: '#c0392b' },
            { name: 'Smoked paprika',   color: '#992020' },
            { name: 'Garlic',           color: '#f0e6d3' },
            { name: 'Onion',            color: '#f5e0b0' },
            { name: 'Olive oil',        color: '#c5b94e' },
            { name: 'Chilli flakes',    color: '#b02020' },
        ]
    },
    {
        name: 'Borscht (Beetroot Soup)',
        matches: ['Red', 'Purple', 'Pink'],
        priority: ['Red', 'Purple'],
        description: 'A Ukrainian classic — deep crimson beetroot soup with a tang of vinegar and a cloud of sour cream on top.',
        ingredients: [
            { name: 'Beetroot',      color: '#9b1a30' },
            { name: 'Red cabbage',   color: '#7a1b3a' },
            { name: 'Carrot',        color: '#e87830' },
            { name: 'Potato',        color: '#e8dcc8' },
            { name: 'Sour cream',    color: '#fff8ee' },
            { name: 'White vinegar', color: '#f0f0f0' },
        ]
    },
    {
        name: 'Gazpacho',
        matches: ['Red', 'Green', 'Orange'],
        priority: ['Red', 'Green'],
        description: 'Spain\'s iconic chilled summer soup — raw blended tomatoes, cucumber, green pepper and garlic, served ice-cold with a drizzle of olive oil.',
        ingredients: [
            { name: 'Tomatoes',       color: '#d63030' },
            { name: 'Cucumber',       color: '#6ab04c' },
            { name: 'Green pepper',   color: '#4a9a30' },
            { name: 'Red onion',      color: '#a0304a' },
            { name: 'Stale bread',    color: '#e8d0a0' },
            { name: 'Olive oil',      color: '#c5b94e' },
        ]
    },
    // ── Oranges ───────────────────────────────────────
    {
        name: 'Carrot & Ginger Soup',
        matches: ['Orange'],
        priority: ['Orange'],
        description: 'A sunny, warming bowl of sweet carrots brightened with fiery ginger and a drizzle of coconut cream.',
        ingredients: [
            { name: 'Carrots',       color: '#e87830' },
            { name: 'Fresh ginger',  color: '#d4b86a' },
            { name: 'Coconut cream', color: '#fff8ee' },
            { name: 'Turmeric',      color: '#d4a820' },
            { name: 'Onion',         color: '#f5e0b0' },
            { name: 'Coriander',     color: '#4caf50' },
        ]
    },
    {
        name: 'Red Lentil & Cumin Soup',
        matches: ['Orange', 'Red', 'Yellow'],
        priority: ['Orange', 'Red'],
        description: 'A hearty Middle-Eastern inspired soup — orange lentils melted into a golden broth, fragrant with cumin and smoked paprika.',
        ingredients: [
            { name: 'Red lentils',   color: '#d4603a' },
            { name: 'Cumin seeds',   color: '#8b6840' },
            { name: 'Smoked paprika',color: '#c03020' },
            { name: 'Tomatoes',      color: '#d63030' },
            { name: 'Garlic',        color: '#f0e6d3' },
            { name: 'Onion',         color: '#f5e0b0' },
        ]
    },
    {
        name: 'Sweet Potato & Coconut Soup',
        matches: ['Orange', 'White', 'Cream'],
        priority: ['Orange', 'White'],
        description: 'Velvety sweet potato simmered in coconut milk with lemongrass and a pinch of chilli for a gentle tropical warmth.',
        ingredients: [
            { name: 'Sweet potato',   color: '#d48a28' },
            { name: 'Coconut milk',   color: '#faf7f0' },
            { name: 'Lemongrass',     color: '#b8c850' },
            { name: 'Chilli',         color: '#d63030' },
            { name: 'Lime juice',     color: '#a0c840' },
            { name: 'Ginger',         color: '#d4b86a' },
        ]
    },
    // ── Yellows ───────────────────────────────────────
    {
        name: 'Butternut Squash Soup',
        matches: ['Yellow', 'Orange', 'Beige'],
        priority: ['Yellow', 'Orange'],
        description: 'A silky, golden soup made from roasted butternut squash, subtly spiced with nutmeg and crowned with a swirl of cream.',
        ingredients: [
            { name: 'Butternut squash', color: '#e8a835' },
            { name: 'Sweet potato',     color: '#d48a28' },
            { name: 'Cream',            color: '#fff5dc' },
            { name: 'Nutmeg',           color: '#8b6e4e' },
            { name: 'Onion',            color: '#f5e0b0' },
            { name: 'Vegetable broth',  color: '#c8b060' },
        ]
    },
    {
        name: 'Golden Turmeric Broth',
        matches: ['Yellow', 'Orange', 'Cream'],
        priority: ['Yellow'],
        description: 'An anti-inflammatory golden broth with turmeric, black pepper, ginger and honey — warming, nourishing and beautifully bright.',
        ingredients: [
            { name: 'Turmeric',      color: '#d4a820' },
            { name: 'Fresh ginger',  color: '#d4b86a' },
            { name: 'Black pepper',  color: '#282828' },
            { name: 'Honey',         color: '#e8b830' },
            { name: 'Coconut milk',  color: '#faf7f0' },
            { name: 'Lemon juice',   color: '#e8e34e' },
        ]
    },
    {
        name: 'Corn Chowder',
        matches: ['Yellow', 'White', 'Cream'],
        priority: ['Yellow', 'White'],
        description: 'A thick, creamy American chowder packed with sweet corn kernels, smoky bacon and chunks of soft potato.',
        ingredients: [
            { name: 'Sweetcorn',    color: '#e8d840' },
            { name: 'Potatoes',     color: '#e8dcc8' },
            { name: 'Smoked bacon', color: '#c06848' },
            { name: 'Double cream', color: '#fffce8' },
            { name: 'Chives',       color: '#5cb85c' },
            { name: 'Butter',       color: '#f5d96a' },
        ]
    },
    // ── Greens ────────────────────────────────────────
    {
        name: 'Garden Pea & Mint Soup',
        matches: ['Green'],
        priority: ['Green'],
        description: 'A vibrant, refreshing soup celebrating the bright green of fresh peas, lifted by fragrant mint and a touch of lemon.',
        ingredients: [
            { name: 'Fresh peas',   color: '#5cb85c' },
            { name: 'Spinach',      color: '#2e7d32' },
            { name: 'Fresh mint',   color: '#4caf50' },
            { name: 'Leek',         color: '#8bc34a' },
            { name: 'Lemon zest',   color: '#e8e34e' },
            { name: 'Cream',        color: '#fff5dc' },
        ]
    },
    {
        name: 'Spinach & Walnut Soup',
        matches: ['Green', 'Dark Green', 'Brown'],
        priority: ['Green', 'Dark Green'],
        description: 'An earthy, iron-rich soup of baby spinach and toasted walnuts, enriched with a hint of Parmesan and nutmeg.',
        ingredients: [
            { name: 'Baby spinach',  color: '#2e7d32' },
            { name: 'Walnuts',       color: '#7a5c38' },
            { name: 'Parmesan',      color: '#e8d8b0' },
            { name: 'Nutmeg',        color: '#8b6e4e' },
            { name: 'Garlic',        color: '#f0e6d3' },
            { name: 'Olive oil',     color: '#c5b94e' },
        ]
    },
    {
        name: 'Zucchini & Basil Soup',
        matches: ['Green', 'White'],
        priority: ['Green', 'White'],
        description: 'A light, summery Italian-inspired soup of courgette blended silky smooth with fresh basil and a cloud of ricotta.',
        ingredients: [
            { name: 'Courgette',    color: '#7bc84c' },
            { name: 'Fresh basil',  color: '#3da53d' },
            { name: 'Ricotta',      color: '#f8f0e8' },
            { name: 'Garlic',       color: '#f0e6d3' },
            { name: 'Lemon',        color: '#e8e34e' },
            { name: 'Onion',        color: '#f5e0b0' },
        ]
    },
    {
        name: 'Cream of Asparagus',
        matches: ['Green', 'Beige', 'White'],
        priority: ['Green', 'Beige'],
        description: 'Elegant and delicate — green asparagus spears simmered and blended into a refined cream soup with a hint of tarragon.',
        ingredients: [
            { name: 'Asparagus',     color: '#6a9e3a' },
            { name: 'Shallots',      color: '#d4b89a' },
            { name: 'Tarragon',      color: '#5a8a38' },
            { name: 'Double cream',  color: '#fffce8' },
            { name: 'White wine',    color: '#e8e0b0' },
            { name: 'Parmesan',      color: '#e8d8b0' },
        ]
    },
    // ── Browns ────────────────────────────────────────
    {
        name: 'Wild Mushroom Soup',
        matches: ['Brown', 'Dark Green', 'Black'],
        priority: ['Brown'],
        description: 'An earthy, deeply flavoured soup with a blend of wild mushrooms, thyme and a splash of truffle oil.',
        ingredients: [
            { name: 'Porcini mushrooms',  color: '#7a5c38' },
            { name: 'Shiitake mushrooms', color: '#6d4c28' },
            { name: 'Thyme',              color: '#6b8e23' },
            { name: 'Shallots',           color: '#9b6b4a' },
            { name: 'Truffle oil',        color: '#3b3b2a' },
            { name: 'Cream',              color: '#fff5dc' },
        ]
    },
    {
        name: 'French Onion Soup',
        matches: ['Brown', 'Beige', 'Orange'],
        priority: ['Brown', 'Beige'],
        description: 'The Parisian bistro classic — caramelised onions in a glossy beef broth, blanketed under a golden gratin of Gruyère crouton.',
        ingredients: [
            { name: 'Brown onions',  color: '#8b5e2a' },
            { name: 'Beef stock',    color: '#6b3820' },
            { name: 'Gruyère',       color: '#e8c060' },
            { name: 'Baguette',      color: '#e8d0a0' },
            { name: 'Cognac',        color: '#c8902a' },
            { name: 'Thyme',         color: '#6b8e23' },
        ]
    },
    {
        name: 'Minestrone',
        matches: ['Brown', 'Red', 'Green', 'Orange'],
        priority: ['Brown', 'Red', 'Green'],
        description: 'The quintessential Italian vegetable soup — hearty, rustically chunky, rich with tomato, pasta, beans and seasonal vegetables.',
        ingredients: [
            { name: 'Cannellini beans', color: '#f0e8d0' },
            { name: 'Pasta (ditalini)', color: '#f5e8c0' },
            { name: 'Tomatoes',         color: '#d63030' },
            { name: 'Carrot',           color: '#e87830' },
            { name: 'Courgette',        color: '#7bc84c' },
            { name: 'Celery',           color: '#8bc850' },
        ]
    },
    // ── Whites & Creams ───────────────────────────────
    {
        name: 'Potato & Leek Soup',
        matches: ['White', 'Cream', 'Beige', 'Grey'],
        priority: ['White', 'Cream'],
        description: 'A comforting, creamy classic — smooth potatoes and tender leeks simmered to perfection with a touch of nutmeg.',
        ingredients: [
            { name: 'Potatoes',      color: '#e8dcc8' },
            { name: 'Leek',          color: '#8bc34a' },
            { name: 'Double cream',  color: '#fffce8' },
            { name: 'Butter',        color: '#f5d96a' },
            { name: 'Chicken stock', color: '#d4c480' },
            { name: 'Nutmeg',        color: '#8b6e4e' },
        ]
    },
    {
        name: 'Thai Coconut Soup (Tom Kha)',
        matches: ['White', 'Cream', 'Green', 'Pink'],
        priority: ['White', 'Green'],
        description: 'A fragrant Thai broth of lemongrass, galangal and coconut milk with silken tofu, mushrooms and a sharp lime finish.',
        ingredients: [
            { name: 'Coconut milk',   color: '#faf7f0' },
            { name: 'Lemongrass',     color: '#b8c850' },
            { name: 'Galangal',       color: '#e8d0a8' },
            { name: 'Kaffir lime',    color: '#6ab04c' },
            { name: 'Mushrooms',      color: '#9b7b5a' },
            { name: 'Chilli',         color: '#d63030' },
        ]
    },
    {
        name: 'Cream of Cauliflower',
        matches: ['White', 'Cream', 'Beige'],
        priority: ['White', 'Beige'],
        description: 'Silky and subtle — roasted cauliflower blended into a velvety cream soup, elevated with aged cheddar and a dusting of chives.',
        ingredients: [
            { name: 'Cauliflower',   color: '#f5f0e0' },
            { name: 'Aged cheddar',  color: '#e8a838' },
            { name: 'Double cream',  color: '#fffce8' },
            { name: 'Chives',        color: '#5cb85c' },
            { name: 'Butter',        color: '#f5d96a' },
            { name: 'Chicken stock', color: '#d4c480' },
        ]
    },
    // ── Purples & Blues ───────────────────────────────
    {
        name: 'Beetroot & Berry Soup',
        matches: ['Purple', 'Pink'],
        priority: ['Purple', 'Pink'],
        description: 'A strikingly colourful soup with earthy beetroot and a hint of berry sweetness, finished with a dollop of sour cream.',
        ingredients: [
            { name: 'Beetroot',     color: '#8b1a4a' },
            { name: 'Red cabbage',  color: '#6a1b6a' },
            { name: 'Blackberries', color: '#4a1050' },
            { name: 'Red onion',    color: '#a0304a' },
            { name: 'Sour cream',   color: '#fff8ee' },
            { name: 'Dill',         color: '#5a9a3a' },
        ]
    },
    {
        name: 'Chilled Blueberry Soup',
        matches: ['Blue', 'Purple'],
        priority: ['Blue'],
        description: 'A Scandinavian-inspired chilled soup — sweet blueberries blended with yoghurt, cinnamon and a squeeze of lemon.',
        ingredients: [
            { name: 'Blueberries',   color: '#3a539b' },
            { name: 'Greek yoghurt', color: '#f5f5f0' },
            { name: 'Cinnamon',      color: '#8b5e3c' },
            { name: 'Honey',         color: '#e8b830' },
            { name: 'Lemon juice',   color: '#e8e34e' },
            { name: 'Vanilla',       color: '#f5e6c8' },
        ]
    },
    // ── Dark / Black ──────────────────────────────────
    {
        name: 'Black Bean Soup',
        matches: ['Black', 'Brown', 'Dark Green'],
        priority: ['Black', 'Brown'],
        description: 'A rich, smoky Latin-American staple — velvety black beans with cumin, chorizo and a squeeze of lime.',
        ingredients: [
            { name: 'Black beans',  color: '#1e1e2a' },
            { name: 'Chorizo',      color: '#9a2a18' },
            { name: 'Cumin',        color: '#8b6840' },
            { name: 'Garlic',       color: '#f0e6d3' },
            { name: 'Lime juice',   color: '#a0c840' },
            { name: 'Sour cream',   color: '#fff8ee' },
        ]
    },
    // ── Reddish-Pink ──────────────────────────────────
    {
        name: 'Rosy Salmon Bisque',
        matches: ['Pink', 'Orange', 'Cream'],
        priority: ['Pink', 'Orange'],
        description: 'A luxurious French-style bisque — fresh salmon and prawns in a silky, coral-coloured cream broth with brandy and tarragon.',
        ingredients: [
            { name: 'Salmon',        color: '#e87060' },
            { name: 'Prawns',        color: '#e86050' },
            { name: 'Double cream',  color: '#fffce8' },
            { name: 'Brandy',        color: '#c8802a' },
            { name: 'Tarragon',      color: '#5a8a38' },
            { name: 'Tomato paste',  color: '#b83020' },
        ]
    },
];

// ──── Match best soup ────
function matchSoup(colors) {
    const names = colors.map(c => closestColorName(c));

    let bestSoup = SOUPS[0], bestScore = -1;
    SOUPS.forEach(soup => {
        let score = 0;

        // Base score: weighted match on dominant colors
        names.forEach((n, i) => {
            const weight = (colors.length - i) * 2; // dominant colors weigh more
            if (soup.matches.includes(n)) score += weight;
        });

        // Priority bonus: extra weight if priority colors appear first
        if (soup.priority) {
            soup.priority.forEach(p => {
                const idx = names.indexOf(p);
                if (idx !== -1) score += (colors.length - idx) * 3; // strong bonus
            });
        }

        if (score > bestScore) { bestScore = score; bestSoup = soup; }
    });

    return bestSoup;
}

// ──── Render helpers ────
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function renderColors(colors) {
    colorPalette.innerHTML = '';
    colorNames.innerHTML = '';

    colors.forEach(c => {
        const hex = rgbToHex(...c);
        const name = closestColorName(c);

        // Swatch
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.background = hex;
        swatch.innerHTML = `<span class="hex-label">${hex}</span>`;
        colorPalette.appendChild(swatch);

        // Name tag
        const tag = document.createElement('span');
        tag.className = 'color-tag';
        tag.innerHTML = `<span class="dot" style="background:${hex}"></span>${name}`;
        colorNames.appendChild(tag);
    });
}

function renderSoup(soup, colors) {
    soupName.textContent  = soup.name;
    soupDesc.textContent  = soup.description;

    ingredientsList.innerHTML = '';
    soup.ingredients.forEach(ing => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="ing-dot" style="background:${ing.color}"></span>${ing.name}`;
        ingredientsList.appendChild(li);
    });

    // Color bar
    soupColorBar.innerHTML = '';
    colors.forEach(c => {
        const div = document.createElement('div');
        div.style.background = rgbToHex(...c);
        soupColorBar.appendChild(div);
    });
}
