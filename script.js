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

// Data keranjang (disimpan di localStorage)
let cart = [];
let currentProduct = null;
let selectedDuration = null;
let selectedQuantity = 1;

// Durasi yang tersedia untuk setiap produk
const durations = [
    { days: 1, price: 14500, name: "1 Hari" },
    { days: 3, price: 34500, name: "3 Hari" },
    { days: 7, price: 64500, name: "7 Hari" },
    { days: 15, price: 99500, name: "15 Hari" },
    { days: 30, price: 159500, name: "30 Hari" },
    { days: 999, price: 0, name: "999 Hari", soldOut: true }
];

// Load keranjang dari localStorage
function loadCart() {
    const savedCart = localStorage.getItem('dripclient_cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
    } else {
        cart = [];
    }
    updateCartCount();
}

// Simpan keranjang ke localStorage
function saveCart() {
    localStorage.setItem('dripclient_cart', JSON.stringify(cart));
    updateCartCount();
}

// Update jumlah item di icon keranjang
function updateCartCount() {
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        cartCount.textContent = count;
        cartCount.style.display = count > 0 ? 'flex' : 'none';
    }
}

// Tambah ke keranjang
function addToCart(product, duration, quantity) {
    const existingIndex = cart.findIndex(item => 
        item.productId === product.id && item.durationDays === duration.days
    );
    
    if (existingIndex !== -1) {
        cart[existingIndex].quantity += quantity;
    } else {
        cart.push({
            productId: product.id,
            productName: product.name,
            durationDays: duration.days,
            durationName: duration.name,
            price: duration.price,
            quantity: quantity,
            fileUrl: product.fileUrl
        });
    }
    
    saveCart();
    alert(`✅ ${product.name} - ${duration.name} (${quantity}x) ditambahkan ke keranjang!`);
}

// Load produk dari Firestore
async function loadProducts() {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;
    
    productsGrid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading produk...</div>';
    
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

// Tampilkan card produk
function displayProductCard(product) {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;
    
    const card = document.createElement('div');
    card.className = 'product-card';
    
    // Rating random antara 4.5 - 5.0
    const rating = (4.5 + Math.random() * 0.5).toFixed(1);
    const soldCount = Math.floor(1000 + Math.random() * 9000);
    
    card.innerHTML = `
        <div class="product-badge">⭐ ${rating} - ${soldCount.toLocaleString()}+ Terjual</div>
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-desc">${escapeHtml(product.description?.substring(0, 80) || 'Produk digital berkualitas')}${product.description?.length > 80 ? '...' : ''}</p>
        <div class="product-footer">
            <button class="btn-buy" onclick="showProductDetail('${product.id}')">
                <i class="fas fa-shopping-bag"></i> BELI SEKARANG
            </button>
        </div>
    `;
    productsGrid.appendChild(card);
}

// Tampilkan detail produk & pilihan durasi
function showProductDetail(productId) {
    const modal = document.getElementById('productModal');
    const modalBody = document.getElementById('modalBody');
    if (!modal || !modalBody) return;
    
    db.collection('products').doc(productId).get().then(doc => {
        if (doc.exists) {
            const product = doc.data();
            currentProduct = { id: productId, ...product };
            selectedDuration = null;
            selectedQuantity = 1;
            
            // Generate HTML durasi
            let durationsHtml = '';
            durations.forEach(dur => {
                const stock = dur.soldOut ? 0 : Math.floor(Math.random() * 100) + 1;
                const isSoldOut = dur.soldOut || stock === 0;
                
                durationsHtml += `
                    <div class="duration-item" onclick="selectDuration(${dur.days})" data-days="${dur.days}">
                        <div class="duration-name">${dur.name}</div>
                        <div class="duration-price">${dur.price > 0 ? 'Rp ' + formatPrice(dur.price) : 'SOLD OUT'}</div>
                        <div class="duration-stock ${isSoldOut ? 'out-of-stock' : ''}">
                            ${isSoldOut ? 'Stok sedang habis' : `Stok: ${stock} kunci`}
                        </div>
                    </div>
                `;
            });
            
            modalBody.innerHTML = `
                <div class="product-detail-header">
                    <h2>${escapeHtml(product.name)}</h2>
                    <p class="product-detail-desc">${escapeHtml(product.description || 'Tidak ada deskripsi')}</p>
                </div>
                <div class="duration-section">
                    <h3><i class="fas fa-clock"></i> Pilih Durasi</h3>
                    <div class="durations-grid" id="durationsGrid">
                        ${durationsHtml}
                    </div>
                </div>
                <div class="quantity-section" id="quantitySection" style="display: none;">
                    <h3><i class="fas fa-calculator"></i> Jumlah Pesanan</h3>
                    <div class="quantity-selector">
                        <button class="qty-btn" onclick="changeQuantity(-1)">-</button>
                        <span id="quantityValue">1</span>
                        <button class="qty-btn" onclick="changeQuantity(1)">+</button>
                        <span id="stockInfo" class="stock-info"></span>
                    </div>
                </div>
                <div class="detail-actions" id="detailActions" style="display: none;">
                    <button class="btn-buy btn-primary" onclick="addToCartFromModal()">
                        <i class="fas fa-cart-plus"></i> Tambah ke Keranjang
                    </button>
                    <button class="btn-buy btn-success" onclick="buyNow()">
                        <i class="fas fa-bolt"></i> Beli Sekarang
                    </button>
                </div>
            `;
            
            modal.style.display = 'block';
        }
    }).catch(error => {
        console.error('Error:', error);
        alert('Gagal memuat detail produk');
    });
}

// Pilih durasi
window.selectDuration = (days) => {
    const duration = durations.find(d => d.days === days);
    if (duration && !duration.soldOut) {
        selectedDuration = duration;
        
        // Update UI
        document.querySelectorAll('.duration-item').forEach(el => {
            el.classList.remove('selected');
            if (parseInt(el.dataset.days) === days) {
                el.classList.add('selected');
            }
        });
        
        // Tampilkan quantity section
        document.getElementById('quantitySection').style.display = 'block';
        document.getElementById('detailActions').style.display = 'flex';
        document.getElementById('quantityValue').innerText = selectedQuantity;
        
        // Random stok untuk demo
        const stock = Math.floor(Math.random() * 100) + 1;
        document.getElementById('stockInfo').innerHTML = `Sedia: ${stock} kunci`;
    }
};

// Ubah quantity
window.changeQuantity = (delta) => {
    const newQuantity = selectedQuantity + delta;
    if (newQuantity >= 1 && newQuantity <= 99) {
        selectedQuantity = newQuantity;
        document.getElementById('quantityValue').innerText = selectedQuantity;
    }
};

// Tambah ke keranjang dari modal
window.addToCartFromModal = () => {
    if (!selectedDuration) {
        alert('Silakan pilih durasi terlebih dahulu!');
        return;
    }
    addToCart(currentProduct, selectedDuration, selectedQuantity);
    closeModal('productModal');
};

// Beli sekarang (langsung checkout)
window.buyNow = () => {
    if (!selectedDuration) {
        alert('Silakan pilih durasi terlebih dahulu!');
        return;
    }
    
    // Clear cart dan langsung checkout item ini
    cart = [];
    addToCart(currentProduct, selectedDuration, selectedQuantity);
    closeModal('productModal');
    showCart();
    setTimeout(() => {
        proceedToCheckout();
    }, 500);
};

// Tampilkan keranjang
function showCart() {
    const modal = document.getElementById('cartModal');
    const cartBody = document.getElementById('cartBody');
    if (!modal || !cartBody) return;
    
    if (cart.length === 0) {
        cartBody.innerHTML = '<div class="cart-empty"><i class="fas fa-shopping-cart"></i> Keranjang kosong</div>';
        modal.style.display = 'block';
        return;
    }
    
    let cartHtml = '<div class="cart-items">';
    let subtotal = 0;
    
    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        cartHtml += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-title">${escapeHtml(item.productName)}</div>
                    <div class="cart-item-detail">${escapeHtml(item.durationName)}</div>
                    <div class="cart-item-price">Rp ${formatPrice(item.price)} x ${item.quantity}</div>
                </div>
                <div class="cart-item-actions">
                    <div class="cart-item-total">Rp ${formatPrice(itemTotal)}</div>
                    <button class="btn-remove" onclick="removeFromCart(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    cartHtml += `</div>
        <div class="cart-summary">
            <div class="cart-subtotal">
                <span>Subtotal:</span>
                <span>Rp ${formatPrice(subtotal)}</span>
            </div>
            <div class="cart-fee">
                <span>Biaya Layanan:</span>
                <span>+ fee (tergantung metode bayar)</span>
            </div>
            <div class="cart-total">
                <span>TOTAL BAYAR:</span>
                <span>Rp ${formatPrice(subtotal)} + fee</span>
            </div>
            <button class="btn-checkout" onclick="proceedToCheckout()">
                <i class="fas fa-arrow-right"></i> LANJUTKAN CHECKOUT
            </button>
        </div>
    `;
    
    cartBody.innerHTML = cartHtml;
    modal.style.display = 'block';
}

// Hapus dari keranjang
window.removeFromCart = (index) => {
    cart.splice(index, 1);
    saveCart();
    showCart();
};

// Proses checkout
function proceedToCheckout() {
    if (cart.length === 0) {
        alert('Keranjang kosong!');
        closeModal('cartModal');
        return;
    }
    
    closeModal('cartModal');
    
    const modal = document.getElementById('checkoutModal');
    const checkoutBody = document.getElementById('checkoutBody');
    if (!modal || !checkoutBody) return;
    
    let subtotal = 0;
    let itemsHtml = '';
    
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        itemsHtml += `
            <div class="checkout-item">
                <span>${escapeHtml(item.productName)} | ${escapeHtml(item.durationName)}</span>
                <span>Rp ${formatPrice(itemTotal)}</span>
                <small>(${item.quantity}x Rp ${formatPrice(item.price)})</small>
            </div>
        `;
    });
    
    checkoutBody.innerHTML = `
        <div class="checkout-items">
            <h3>Detail Pesanan</h3>
            ${itemsHtml}
        </div>
        <div class="checkout-summary">
            <div class="summary-row">
                <span>Subtotal:</span>
                <span>Rp ${formatPrice(subtotal)}</span>
            </div>
            <div class="summary-row">
                <span>Biaya Layanan:</span>
                <span>+ fee (tergantung metode bayar)</span>
            </div>
            <div class="summary-row total">
                <span>TOTAL BAYAR:</span>
                <span>Rp ${formatPrice(subtotal)} + fee</span>
            </div>
        </div>
        <div class="checkout-form">
            <div class="form-group">
                <label>NAMA LENGKAP</label>
                <input type="text" id="customerName" placeholder="John Doe" value="John Doe">
            </div>
            <div class="form-group">
                <label>EMAIL</label>
                <input type="email" id="customerEmail" placeholder="email@example.com" value="customer@example.com">
            </div>
        </div>
        <div class="checkout-actions">
            <button class="btn-buy btn-primary" onclick="processCheckout()">
                <i class="fas fa-credit-card"></i> BAYAR SEKARANG (Rp ${formatPrice(subtotal)} + fee)
            </button>
        </div>
        <div class="checkout-footer">
            <i class="fas fa-lock"></i> Pembayaran Terenkripsi & Aman oleh Pakasir
            <div class="license-note">License Key akan di-generate otomatis setelah pembayaran sukses.</div>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Proses pembayaran
function processCheckout() {
    const name = document.getElementById('customerName')?.value || 'Customer';
    const email = document.getElementById('customerEmail')?.value || 'customer@example.com';
    
    if (!name || !email) {
        alert('Silakan isi nama dan email!');
        return;
    }
    
    const subtotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    
    alert(`✅ Pesanan diterima!\n\nNama: ${name}\nEmail: ${email}\nTotal: Rp ${formatPrice(subtotal)} + fee\n\nDemo - Untuk production, integrasikan payment gateway real.`);
    
    // Download file pertama
    if (cart.length > 0 && cart[0].fileUrl) {
        window.open(cart[0].fileUrl, '_blank');
    }
    
    // Clear cart setelah checkout
    cart = [];
    saveCart();
    closeModal('checkoutModal');
    alert('Terima kasih telah berbelanja! File akan diunduh.');
}

function formatPrice(price) {
    return new Intl.NumberFormat('id-ID').format(price);
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

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    loadProducts();
    
    // Cart icon click
    const cartIcon = document.getElementById('cartIcon');
    if (cartIcon) {
        cartIcon.addEventListener('click', (e) => {
            e.preventDefault();
            showCart();
        });
    }
    
    // Close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.onclick = function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        }
    });
});

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}
