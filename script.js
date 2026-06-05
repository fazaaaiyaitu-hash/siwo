// Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCDUbOkxaVWwfANbe1qQaV__BH2nwrc5FI",
  authDomain: "siwoweb.firebaseapp.com",
  projectId: "siwoweb",
  storageBucket: "siwoweb.firebasestorage.app",
  messagingSenderId: "587733291794",
  appId: "1:587733291794:web:b272d84e07c174a7ead9cb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentProduct = null;

// Load produk dari Firestore
async function loadProducts() {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;
    
    productsGrid.innerHTML = '<div class="loading">Loading produk...</div>';
    
    try {
        const snapshot = await db.collection('products').get();
        
        if (snapshot.empty) {
            productsGrid.innerHTML = '<div class="loading">Belum ada produk</div>';
            return;
        }
        
        productsGrid.innerHTML = '';
        snapshot.forEach(doc => {
            const product = { id: doc.id, ...doc.data() };
            displayProductCard(product);
        });
    } catch (error) {
        console.error('Error loading products:', error);
        productsGrid.innerHTML = '<div class="loading">Gagal memuat produk</div>';
    }
}

function displayProductCard(product) {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;
    
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const shortDesc = product.description ? 
        (product.description.substring(0, 100) + (product.description.length > 100 ? '...' : '')) : 
        'Tidak ada deskripsi';
    
    card.innerHTML = `
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(shortDesc)}</p>
        <div class="price">Rp ${formatPrice(product.price)}</div>
        <button class="btn-buy" onclick="showCheckout('${product.id}')">Beli Sekarang</button>
    `;
    productsGrid.appendChild(card);
}

function formatPrice(price) {
    return new Intl.NumberFormat('id-ID').format(price);
}

function showCheckout(productId) {
    const modal = document.getElementById('checkoutModal');
    const checkoutBody = document.getElementById('checkoutBody');
    if (!modal || !checkoutBody) return;
    
    db.collection('products').doc(productId).get().then(doc => {
        if (doc.exists) {
            const product = doc.data();
            currentProduct = { id: productId, ...product };
            
            checkoutBody.innerHTML = `
                <h3>${escapeHtml(product.name)}</h3>
                <p>Harga: Rp ${formatPrice(product.price)}</p>
                <hr>
                <h4>Instruksi Pembayaran:</h4>
                <p>Transfer ke rekening berikut:</p>
                <p><strong>Bank BCA: 1234567890 a.n DigitalStore</strong></p>
                <p>Setelah transfer, klik tombol di bawah untuk download:</p>
                <button onclick="processPayment()" class="btn-buy">Saya sudah bayar, Download Sekarang</button>
                <p style="font-size:12px; margin-top:10px;">*Demo - untuk production gunakan payment gateway real</p>
            `;
            modal.style.display = 'block';
        }
    }).catch(error => {
        console.error('Error:', error);
        alert('Gagal memuat data produk');
    });
}

function processPayment() {
    if (currentProduct && currentProduct.fileUrl) {
        window.open(currentProduct.fileUrl, '_blank');
        closeModal('checkoutModal');
        alert('Terima kasih telah membeli! File akan diunduh.');
    } else {
        alert('URL file tidak tersedia. Silakan hubungi admin.');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Event listeners
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    
    document.querySelectorAll('.close').forEach(btn => {
        btn.onclick = function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        }
    });
});
