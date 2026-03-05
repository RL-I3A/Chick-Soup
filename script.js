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

// ──── Clipboard paste (Ctrl+V / ⌘V) ────
document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            handleFile(item.getAsFile());
            break;
        }
    }
});

// ──── Handle uploaded file ────
async function handleFile(file) {
    // Accept by MIME type OR by extension (covers HEIC, HEIF, and browsers
    // that return empty type for some formats)
    const isImage = file.type.startsWith('image/')
        || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif|svg)$/i.test(file.name);
    if (!isImage) {
        alert('Please upload an image file (JPEG, PNG, HEIC, WebP, etc.)');
        return;
    }

    // Show loading spinner
    const loader = document.createElement('div');
    loader.className = 'loading-overlay';
    loader.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loader);

    try {
        // 1. Read as Data URL (for the visible <img> preview)
        const dataUrl = await readAsDataURL(file);
        previewImg.src = dataUrl;

        // 2. Get a drawable source with proper EXIF orientation
        //    createImageBitmap({ imageOrientation: 'from-image' }) corrects iPhone
        //    rotation automatically. Falls back to plain Image if not supported.
        let drawable;
        try {
            drawable = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (_) {
            drawable = await loadImage(dataUrl);
        }

        const colors = extractColors(drawable, 5);
        const soup   = matchSoup(colors);
        renderColors(colors);
        renderSoup(soup, colors);

        uploadSection.classList.add('hidden');
        resultSection.classList.remove('hidden');
    } catch (err) {
        console.error(err);
        alert('Could not read this image. Try a JPEG or PNG if the problem persists.');
    } finally {
        loader.remove();
    }
}

// Promisified FileReader
function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Promisified Image loader
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
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
    // ── World cuisines ─────────────────────────────────
    {
        name: 'Pho Bo (Vietnamese Beef)',
        matches: ['Brown', 'Beige', 'Orange'],
        priority: ['Brown', 'Beige'],
        description: 'Vietnam\'s iconic noodle soup — a long-simmered beef broth perfumed with star anise, cinnamon and ginger, served with rice noodles, herbs and lime.',
        ingredients: [
            { name: 'Beef bones',  color: '#6b3820' },
            { name: 'Star anise',  color: '#3a2010' },
            { name: 'Cinnamon',    color: '#8b5e3c' },
            { name: 'Rice noodles',color: '#f5f0e0' },
            { name: 'Fresh lime',  color: '#a0c840' },
            { name: 'Bean sprouts',color: '#e8e8d0' },
        ]
    },
    {
        name: 'Miso Ramen',
        matches: ['Brown', 'Beige', 'Yellow', 'Orange'],
        priority: ['Brown', 'Yellow'],
        description: 'A Japanese soul-food classic — rich miso broth with ramen noodles, a marinated soft-boiled egg, nori and roasted sesame.',
        ingredients: [
            { name: 'White miso',      color: '#d4c090' },
            { name: 'Ramen noodles',   color: '#f5e8c0' },
            { name: 'Soft-boiled egg', color: '#f5d06a' },
            { name: 'Nori seaweed',    color: '#1e2e20' },
            { name: 'Sesame seeds',    color: '#d4c090' },
            { name: 'Spring onion',    color: '#5cb85c' },
        ]
    },
    {
        name: 'Harira (Moroccan Lamb)',
        matches: ['Brown', 'Red', 'Orange', 'Yellow'],
        priority: ['Brown', 'Red'],
        description: 'Morocco\'s hearty national soup — lamb, chickpeas, lentils and tomatoes richly spiced with turmeric, cinnamon, coriander and finished with a squeeze of lemon.',
        ingredients: [
            { name: 'Lamb pieces',   color: '#8b4030' },
            { name: 'Chickpeas',     color: '#e0c888' },
            { name: 'Red lentils',   color: '#d4603a' },
            { name: 'Tomatoes',      color: '#d63030' },
            { name: 'Turmeric',      color: '#d4a820' },
            { name: 'Coriander',     color: '#4caf50' },
        ]
    },
    {
        name: 'Mulligatawny',
        matches: ['Yellow', 'Orange', 'Brown', 'Green'],
        priority: ['Yellow', 'Orange'],
        description: 'An Anglo-Indian classic — lentils and chicken simmered in a fragrant curry broth with apple, coconut milk and a brightness of coriander.',
        ingredients: [
            { name: 'Red lentils',  color: '#d4603a' },
            { name: 'Chicken',      color: '#e8c890' },
            { name: 'Curry powder', color: '#d4a020' },
            { name: 'Apple',        color: '#c8e060' },
            { name: 'Coconut milk', color: '#faf7f0' },
            { name: 'Coriander',    color: '#4caf50' },
        ]
    },
    {
        name: 'Bouillabaisse',
        matches: ['Orange', 'Red', 'Yellow', 'Brown'],
        priority: ['Orange', 'Red'],
        description: 'The grand Provençal seafood soup — a golden saffron broth brimming with fish, mussels, prawns and fennel, served with rouille and crusty bread.',
        ingredients: [
            { name: 'Mixed fish',   color: '#e8d0a8' },
            { name: 'Mussels',      color: '#2a2a3a' },
            { name: 'Saffron',      color: '#d4a820' },
            { name: 'Fennel',       color: '#b8c850' },
            { name: 'Tomatoes',     color: '#d63030' },
            { name: 'Rouille',      color: '#e8a030' },
        ]
    },
    {
        name: 'Avgolemono (Greek Lemon Chicken)',
        matches: ['Yellow', 'Cream', 'White', 'Beige'],
        priority: ['Yellow', 'Cream'],
        description: 'A silky Greek comfort soup — delicate chicken broth thickened with eggs and brightened with a generous squeeze of lemon, served with orzo.',
        ingredients: [
            { name: 'Chicken stock', color: '#d4c480' },
            { name: 'Orzo pasta',    color: '#f5e8c0' },
            { name: 'Egg yolk',      color: '#f5c840' },
            { name: 'Lemon juice',   color: '#e8e34e' },
            { name: 'Shredded chicken', color: '#e8d0a8' },
            { name: 'Fresh dill',    color: '#5a9a3a' },
        ]
    },
    {
        name: 'Caldo Verde (Portuguese Kale)',
        matches: ['Green', 'Dark Green', 'Beige'],
        priority: ['Green', 'Dark Green'],
        description: 'Portugal\'s beloved national soup — a silky potato base studded with ribbons of deep green kale and thin rounds of smoky chouriço.',
        ingredients: [
            { name: 'Kale',          color: '#2e7d32' },
            { name: 'Potatoes',      color: '#e8dcc8' },
            { name: 'Chouriço',      color: '#9a3820' },
            { name: 'Garlic',        color: '#f0e6d3' },
            { name: 'Olive oil',     color: '#c5b94e' },
            { name: 'Onion',         color: '#f5e0b0' },
        ]
    },
    {
        name: 'Ribollita (Tuscan Bread Soup)',
        matches: ['Green', 'Brown', 'White', 'Orange'],
        priority: ['Green', 'Brown'],
        description: 'A Tuscan peasant masterpiece — stale bread dissolved into a thick, warming stew of cannellini beans, cavolo nero and hearty vegetables.',
        ingredients: [
            { name: 'Cavolo nero',       color: '#1e4a20' },
            { name: 'Cannellini beans',  color: '#f0e8d0' },
            { name: 'Stale bread',       color: '#e8d0a0' },
            { name: 'Celery',            color: '#8bc850' },
            { name: 'Carrot',            color: '#e87830' },
            { name: 'Rosemary',          color: '#5a7830' },
        ]
    },
    {
        name: 'Cream of Broccoli',
        matches: ['Green', 'Cream', 'White'],
        priority: ['Green', 'Cream'],
        description: 'Vivid green broccoli florets blended into a luxuriously smooth cream soup, finished with aged cheddar and crispy broccoli crumbs on top.',
        ingredients: [
            { name: 'Broccoli',      color: '#3a8a30' },
            { name: 'Aged cheddar',  color: '#e8a838' },
            { name: 'Double cream',  color: '#fffce8' },
            { name: 'Garlic',        color: '#f0e6d3' },
            { name: 'Onion',         color: '#f5e0b0' },
            { name: 'Nutmeg',        color: '#8b6e4e' },
        ]
    },
    {
        name: 'Watercress Soup',
        matches: ['Dark Green', 'Green', 'Cream'],
        priority: ['Dark Green'],
        description: 'An elegant, peppery British classic — peppery watercress blended with potato into a vivid emerald cream, finished with crème fraîche.',
        ingredients: [
            { name: 'Watercress',    color: '#1e5a20' },
            { name: 'Potato',        color: '#e8dcc8' },
            { name: 'Crème fraîche', color: '#fffce8' },
            { name: 'Shallots',      color: '#d4b89a' },
            { name: 'Butter',        color: '#f5d96a' },
            { name: 'Nutmeg',        color: '#8b6e4e' },
        ]
    },
    {
        name: 'Chilled Cucumber & Mint Soup',
        matches: ['Green', 'White', 'Grey'],
        priority: ['Green', 'White'],
        description: 'A spa-like chilled soup — cool cucumber, fresh mint and tangy yoghurt blended into a refreshing pale green cloud for hot summer days.',
        ingredients: [
            { name: 'Cucumber',      color: '#8ad050' },
            { name: 'Greek yoghurt', color: '#f5f5f0' },
            { name: 'Fresh mint',    color: '#4caf50' },
            { name: 'Garlic',        color: '#f0e6d3' },
            { name: 'Lemon juice',   color: '#e8e34e' },
            { name: 'Dill',          color: '#5a9a3a' },
        ]
    },
    {
        name: 'Pumpkin & Sage Soup',
        matches: ['Orange', 'Yellow', 'Dark Green'],
        priority: ['Orange', 'Dark Green'],
        description: 'Autumn in a bowl — roasted pumpkin deep with sweet caramel notes, balanced by earthy sage and a drizzle of toasted pine-nut butter.',
        ingredients: [
            { name: 'Pumpkin',     color: '#e07830' },
            { name: 'Fresh sage',  color: '#7a9030' },
            { name: 'Pine nuts',   color: '#d4c090' },
            { name: 'Brown butter',color: '#a87030' },
            { name: 'Cream',       color: '#fff5dc' },
            { name: 'Nutmeg',      color: '#8b6e4e' },
        ]
    },
    {
        name: 'Melon Gazpacho',
        matches: ['Yellow', 'Orange', 'Cream'],
        priority: ['Yellow', 'Cream'],
        description: 'A playful Spanish riff — chilled Cantaloupe melon blended with cucumber, ginger and a touch of sherry vinegar into a pale golden velvet.',
        ingredients: [
            { name: 'Cantaloupe melon', color: '#f0b870' },
            { name: 'Cucumber',         color: '#8ad050' },
            { name: 'Sherry vinegar',   color: '#c8902a' },
            { name: 'Fresh ginger',     color: '#d4b86a' },
            { name: 'Mint',             color: '#4caf50' },
            { name: 'Olive oil',        color: '#c5b94e' },
        ]
    },
    {
        name: 'Lobster Bisque',
        matches: ['Orange', 'Pink', 'Red', 'Brown'],
        priority: ['Orange', 'Pink'],
        description: 'The pinnacle of French luxury — a coral-orange cream bisque built from lobster shells, cognac, tarragon and a silky velvet of double cream.',
        ingredients: [
            { name: 'Lobster',       color: '#e06040' },
            { name: 'Double cream',  color: '#fffce8' },
            { name: 'Cognac',        color: '#c8802a' },
            { name: 'Tarragon',      color: '#5a8a38' },
            { name: 'Tomato paste',  color: '#b83020' },
            { name: 'Shallots',      color: '#d4b89a' },
        ]
    },
    {
        name: 'Garlic Soup (Soupe à l\'Ail)',
        matches: ['White', 'Yellow', 'Beige'],
        priority: ['White', 'Yellow'],
        description: 'A Gascon peasant treasure — whole heads of garlic simmered until sweet and mellow in a golden broth, thickened with egg yolks and bread.',
        ingredients: [
            { name: 'Garlic (whole)', color: '#f5e8c0' },
            { name: 'Egg yolks',      color: '#f5c840' },
            { name: 'Bread',          color: '#e8d0a0' },
            { name: 'Olive oil',      color: '#c5b94e' },
            { name: 'Thyme',          color: '#6b8e23' },
            { name: 'Chicken stock',  color: '#d4c480' },
        ]
    },
    {
        name: 'Tom Yum Kung',
        matches: ['Red', 'Orange', 'Green', 'Yellow'],
        priority: ['Red', 'Orange'],
        description: 'Thailand\'s most iconic soup — a fiery, sour and fragrant clear broth with prawns, lemongrass, kaffir lime, galangal and Thai chillies.',
        ingredients: [
            { name: 'Tiger prawns', color: '#e86050' },
            { name: 'Lemongrass',   color: '#b8c850' },
            { name: 'Thai chilli',  color: '#d63030' },
            { name: 'Kaffir lime',  color: '#6ab04c' },
            { name: 'Fish sauce',   color: '#c8a040' },
            { name: 'Galangal',     color: '#e8d0a8' },
        ]
    },
    {
        name: 'Cream of Celery',
        matches: ['Beige', 'White', 'Green'],
        priority: ['Beige', 'White'],
        description: 'An understated British classic — celery slow-cooked in butter until meltingly soft, then blended into a silky pale cream soup with a whisper of mace.',
        ingredients: [
            { name: 'Celery',        color: '#9abf60' },
            { name: 'Onion',         color: '#f5e0b0' },
            { name: 'Double cream',  color: '#fffce8' },
            { name: 'Mace',          color: '#d4a060' },
            { name: 'Butter',        color: '#f5d96a' },
            { name: 'Chicken stock', color: '#d4c480' },
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
