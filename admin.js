// Konfigurasi Firebase - GANTI DENGAN PUNYA ANDA
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
const auth = firebase.auth();

// Hapus storage karena tidak dipakai
// const storage = firebase.storage();

let editingProductId = null;
let loginAttempts = 0;
let sessionTimeout;
let inactivityTimer;
let currentOtpCode = null;
let otpExpiryTime = null;

// ========== PROTEKSI EXTRA ==========

// 1. Deteksi DevTools/Console
(function detectDevTools() {
    const element = new Image();
    Object.defineProperty(element, 'id', {
        get: function() {
            document.body.innerHTML = '<h1>Akses Ditolak</h1>';
            window.location.href = '/';
        }
    });
    console.log('%c', element);
})();

// 2. Blokir klik kanan
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
});

// 3. Blokir shortcut developer tools
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
        return false;
    }
});

// 4. Rate limiting login (5 attempts max) - Lock 1 MENIT
function checkLoginAttempts() {
    const attempts = parseInt(localStorage.getItem('loginAttempts') || '0');
    const lockTime = localStorage.getItem('loginLockTime');
    
    if (lockTime) {
        const elapsed = Date.now() - parseInt(lockTime);
        const lockDuration = 1 * 60 * 1000;
        
        if (elapsed < lockDuration) {
            const remainingSeconds = Math.ceil((lockDuration - elapsed) / 1000);
            return { 
                locked: true, 
                remaining: remainingSeconds,
                unit: 'detik'
            };
        } else {
            localStorage.removeItem('loginAttempts');
            localStorage.removeItem('loginLockTime');
        }
    }
    
    if (attempts >= 5) {
        localStorage.setItem('loginLockTime', Date.now());
        return { 
            locked: true, 
            remaining: 60,
            unit: 'detik'
        };
    }
    
    return { locked: false };
}

// 5. Session timeout (30 menit)
function resetSessionTimer() {
    if (sessionTimeout) clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(() => {
        alert('Sesi Anda habis karena tidak ada aktivitas. Silakan login kembali.');
        handleLogout();
    }, 30 * 60 * 1000);
}

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    resetSessionTimer();
    
    const timerDiv = document.getElementById('sessionTimer');
    if (timerDiv && auth.currentUser) {
        timerDiv.style.display = 'block';
        let timeLeft = 30 * 60;
        const interval = setInterval(() => {
            if (!auth.currentUser) {
                clearInterval(interval);
                timerDiv.style.display = 'none';
                return;
            }
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            timerDiv.textContent = `Sesi berakhir: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            timeLeft--;
            if (timeLeft < 0) clearInterval(interval);
        }, 1000);
    }
}

// Aktivitas user
['click', 'mousemove', 'keypress', 'scroll'].forEach(event => {
    document.addEventListener(event, () => {
        if (auth.currentUser) {
            resetInactivityTimer();
        }
    });
});

// ========== FUNGSI OTP ==========

function generateOtpCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendOtpToAdmin(email) {
    currentOtpCode = generateOtpCode();
    otpExpiryTime = Date.now() + 5 * 60 * 1000;
    
    alert(`🔐 KODE OTP ANDA: ${currentOtpCode}\n\nKode berlaku 5 menit.\nJangan berikan kode ini kepada siapapun!`);
    console.log(`📱 Kode OTP untuk ${email}: ${currentOtpCode} (berlaku 5 menit)`);
    
    return currentOtpCode;
}

function verifyOtp(inputCode) {
    if (!currentOtpCode || !otpExpiryTime) {
        return { valid: false, message: 'Belum ada kode OTP. Kirim ulang.' };
    }
    
    if (Date.now() > otpExpiryTime) {
        currentOtpCode = null;
        otpExpiryTime = null;
        return { valid: false, message: 'Kode OTP sudah expired. Kirim ulang.' };
    }
    
    if (inputCode === currentOtpCode) {
        currentOtpCode = null;
        otpExpiryTime = null;
        return { valid: true, message: 'Sukses' };
    }
    
    return { valid: false, message: 'Kode OTP salah!' };
}

// ========== FUNGSI LOGOUT ==========
async function handleLogout() {
    try {
        if (auth.currentUser) {
            await db.collection('adminLogs').add({
                email: auth.currentUser.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                action: 'logout'
            });
        }
        await auth.signOut();
        
        // Reset form
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        
        // Sembunyikan tombol logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.style.display = 'none';
        
        // Tampilkan form login
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
        
        // Clear session timer
        if (sessionTimeout) clearTimeout(sessionTimeout);
        
        console.log('Logout berhasil');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ========== AUTHENTICATION WITH OTP ==========

// Auth state observer
auth.onAuthStateChanged(async (user) => {
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (user) {
        // Cek apakah user ada di collection 'admins' (whitelist)
        const adminDoc = await db.collection('admins').doc(user.uid).get();
        if (!adminDoc.exists) {
            alert('Anda tidak memiliki akses admin.');
            await handleLogout();
            return;
        }
        
        // Login sukses - tampilkan tombol logout
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('adminEmail').innerText = user.email;
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        
        // Reset login attempts
        localStorage.removeItem('loginAttempts');
        localStorage.removeItem('loginLockTime');
        
        loadAdminProducts();
        resetInactivityTimer();
        
        // Log akses admin
        try {
            await db.collection('adminLogs').add({
                email: user.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                action: 'login',
                ip: await getClientIP()
            });
        } catch (e) {
            console.log('Log error:', e);
        }
        
    } else {
        // User logout - sembunyikan tombol logout
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (sessionTimeout) clearTimeout(sessionTimeout);
    }
});

// Event listener untuk tombol logout
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});

// Login dengan proteksi + OTP
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const loginCheck = checkLoginAttempts();
        if (loginCheck.locked) {
            const unit = loginCheck.unit || 'detik';
            document.getElementById('loginMessage').innerHTML = `⛔ Terlalu banyak percobaan. Coba lagi ${loginCheck.remaining} ${unit} lagi.`;
            return;
        }
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const loginBtn = document.getElementById('loginBtn');
        
        loginBtn.disabled = true;
        loginBtn.textContent = 'Memproses...';
        
        try {
            // STEP 1: Login ke Firebase dengan email & password
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // STEP 2: Verifikasi admin whitelist
            const adminDoc = await db.collection('admins').doc(user.uid).get();
            if (!adminDoc.exists) {
                await auth.signOut();
                throw new Error('Akun tidak terdaftar sebagai admin.');
            }
            
            // STEP 3: Kirim OTP
            sendOtpToAdmin(email);
            
            // STEP 4: Minta input OTP
            const userOtp = prompt('🔐 Masukkan kode OTP yang telah dikirim:');
            
            if (!userOtp) {
                await auth.signOut();
                throw new Error('OTP tidak dimasukkan.');
            }
            
            // STEP 5: Verifikasi OTP
            const otpResult = verifyOtp(userOtp);
            if (!otpResult.valid) {
                await auth.signOut();
                throw new Error(otpResult.message);
            }
            
            // STEP 6: Sukses login
            document.getElementById('loginMessage').innerHTML = '';
            loginAttempts = 0;
            localStorage.removeItem('loginAttempts');
            localStorage.removeItem('loginLockTime');
            
            alert('✅ Login berhasil! Selamat datang admin.');
            
        } catch (error) {
            loginAttempts++;
            localStorage.setItem('loginAttempts', loginAttempts);
            
            const remainingAttempts = 5 - loginAttempts;
            
            let errorMsg = '';
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMsg = 'Email tidak terdaftar';
                    break;
                case 'auth/wrong-password':
                    errorMsg = `Password salah. Sisa percobaan: ${remainingAttempts} kali`;
                    break;
                case 'auth/too-many-requests':
                    errorMsg = 'Terlalu banyak percobaan. Coba lagi nanti.';
                    break;
                default:
                    errorMsg = error.message;
            }
            
            document.getElementById('loginMessage').innerHTML = `❌ Login gagal: ${errorMsg}`;
            console.error('Login error:', error);
            
            // Jika login gagal, logout untuk bersih-bersih
            await auth.signOut();
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    });
}

// Helper: get client IP
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch {
        return 'unknown';
    }
}

// ========== CRUD PRODUCTS (TANPA STORAGE) ==========

async function loadAdminProducts() {
    const tbody = document.getElementById('adminProductsList');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    
    try {
        const snapshot = await db.collection('products').get();
        tbody.innerHTML = '';
        
        snapshot.forEach(doc => {
            const product = doc.data();
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${escapeHtml(product.name)}</td>
                <td>Rp ${formatPrice(product.price)}</td>
                <td>
                    <button class="btn-edit" onclick="editProduct('${doc.id}')">Edit</button>
                    <button class="btn-delete" onclick="deleteProduct('${doc.id}')">Hapus</button>
                </td>
            `;
        });
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = '<tr><td colspan="3">Error loading products</td></tr>';
    }
}

function formatPrice(price) {
    return new Intl.NumberFormat('id-ID').format(price);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Tambah produk
const addProductBtn = document.getElementById('addProductBtn');
if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
        editingProductId = null;
        document.getElementById('modalTitle').innerText = 'Tambah Produk';
        document.getElementById('productForm').reset();
        document.getElementById('productFormModal').style.display = 'block';
    });
}

// Submit form produk - TANPA UPLOAD FILE
const productForm = document.getElementById('productForm');
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('productName').value;
        const description = document.getElementById('productDesc').value;
        const price = parseInt(document.getElementById('productPrice').value);
        const fileUrl = document.getElementById('productFileUrl').value;
        
        const saveBtn = document.getElementById('saveProductBtn');
        
        // Validasi
        if (!name) {
            alert('Nama produk harus diisi!');
            return;
        }
        
        if (!price || price <= 0) {
            alert('Harga harus diisi dengan angka yang valid!');
            return;
        }
        
        if (!fileUrl) {
            alert('URL file download harus diisi!');
            return;
        }
        
        saveBtn.disabled = true;
        saveBtn.textContent = 'Menyimpan...';
        
        try {
            const productData = {
                name: name,
                description: description,
                price: price,
                fileUrl: fileUrl,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            if (editingProductId) {
                await db.collection('products').doc(editingProductId).update(productData);
                alert('Produk berhasil diupdate!');
            } else {
                productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('products').add(productData);
                alert('Produk berhasil ditambahkan!');
            }
            
            // Log aktivitas
            if (auth.currentUser) {
                await db.collection('adminLogs').add({
                    email: auth.currentUser.email,
                    action: editingProductId ? 'update_product' : 'add_product',
                    productName: name,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            closeModal('productFormModal');
            productForm.reset();
            loadAdminProducts();
            
        } catch (error) {
            console.error('Error:', error);
            alert('Gagal menyimpan produk: ' + error.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Simpan';
        }
    });
}

// Edit produk
window.editProduct = async (id) => {
    editingProductId = id;
    const doc = await db.collection('products').doc(id).get();
    const product = doc.data();
    
    document.getElementById('modalTitle').innerText = 'Edit Produk';
    document.getElementById('productName').value = product.name;
    document.getElementById('productDesc').value = product.description;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productFileUrl').value = product.fileUrl || '';
    
    document.getElementById('productFormModal').style.display = 'block';
};

// Delete produk
window.deleteProduct = async (id) => {
    if (confirm('Yakin ingin menghapus produk ini? Tindakan ini tidak bisa dibatalkan.')) {
        try {
            const productDoc = await db.collection('products').doc(id).get();
            const productName = productDoc.data()?.name;
            
            await db.collection('products').doc(id).delete();
            
            if (auth.currentUser) {
                await db.collection('adminLogs').add({
                    email: auth.currentUser.email,
                    action: 'delete_product',
                    productName: productName,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            alert('Produk berhasil dihapus!');
            loadAdminProducts();
        } catch (error) {
            alert('Gagal menghapus: ' + error.message);
        }
    }
};

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Modal close handlers
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

document.querySelectorAll('.close').forEach(btn => {
    btn.onclick = function() {
        this.closest('.modal').style.display = 'none';
    }
});
