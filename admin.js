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
const storage = firebase.storage();
const auth = firebase.auth();

let editingProductId = null;
let loginAttempts = 0;
let sessionTimeout;
let inactivityTimer;

// ========== PROTEKSI EXTRA ==========

// 1. Deteksi DevTools/Console
(function detectDevTools() {
    const element = new Image();
    Object.defineProperty(element, 'id', {
        get: function() {
            // Jika console terbuka, redirect atau clear
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
    // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
        return false;
    }
});

// 4. Rate limiting login (5 attempts max)
function checkLoginAttempts() {
    const attempts = localStorage.getItem('loginAttempts') || 0;
    const lockTime = localStorage.getItem('loginLockTime');
    
    if (lockTime && Date.now() - parseInt(lockTime) < 15 * 60 * 1000) {
        return { locked: true, remaining: Math.ceil((15 * 60 * 1000 - (Date.now() - parseInt(lockTime))) / 1000 / 60) };
    }
    
    if (attempts >= 5) {
        localStorage.setItem('loginLockTime', Date.now());
        return { locked: true, remaining: 15 };
    }
    
    return { locked: false };
}

// 5. Session timeout (30 menit)
function resetSessionTimer() {
    if (sessionTimeout) clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(() => {
        alert('Sesi Anda habis karena tidak ada aktivitas. Silakan login kembali.');
        auth.signOut();
    }, 30 * 60 * 1000); // 30 menit
}

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    resetSessionTimer();
    
    // Tampilkan timer di UI
    const timerDiv = document.getElementById('sessionTimer');
    if (timerDiv) {
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

// ========== AUTHENTICATION ==========

// Auth state observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Verifikasi email harus terverifikasi
        if (!user.emailVerified) {
            alert('Email belum diverifikasi. Periksa email Anda.');
            await auth.signOut();
            return;
        }
        
        // Cek apakah user ada di collection 'admins' (whitelist)
        const adminDoc = await db.collection('admins').doc(user.uid).get();
        if (!adminDoc.exists) {
            alert('Anda tidak memiliki akses admin.');
            await auth.signOut();
            return;
        }
        
        // Login sukses
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('adminEmail').innerText = user.email;
        
        // Reset login attempts
        localStorage.removeItem('loginAttempts');
        localStorage.removeItem('loginLockTime');
        
        loadAdminProducts();
        resetInactivityTimer();
        
        // Log akses admin
        await db.collection('adminLogs').add({
            email: user.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            action: 'login',
            ip: await getClientIP()
        });
        
    } else {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
        if (sessionTimeout) clearTimeout(sessionTimeout);
    }
});

// Login dengan proteksi
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const loginCheck = checkLoginAttempts();
    if (loginCheck.locked) {
        document.getElementById('loginMessage').innerHTML = `Terlalu banyak percobaan. Coba lagi ${loginCheck.remaining} menit lagi.`;
        return;
    }
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    
    loginBtn.disabled = true;
    loginBtn.textContent = 'Memproses...';
    
    try {
        // Login ke Firebase
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Verifikasi email
        if (!user.emailVerified) {
            await auth.signOut();
            throw new Error('Email belum diverifikasi. Silakan verifikasi email Anda terlebih dahulu.');
        }
        
        // Verifikasi admin whitelist
        const adminDoc = await db.collection('admins').doc(user.uid).get();
        if (!adminDoc.exists) {
            await auth.signOut();
            throw new Error('Akun tidak terdaftar sebagai admin.');
        }
        
        // Sukses
        document.getElementById('loginMessage').innerHTML = '';
        loginAttempts = 0;
        
    } catch (error) {
        loginAttempts++;
        localStorage.setItem('loginAttempts', loginAttempts);
        
        let errorMsg = 'Login gagal: ';
        switch (error.code) {
            case 'auth/user-not-found':
                errorMsg += 'Email tidak terdaftar';
                break;
            case 'auth/wrong-password':
                errorMsg += 'Password salah';
                break;
            case 'auth/too-many-requests':
                errorMsg += 'Terlalu banyak percobaan. Coba lagi nanti.';
                break;
            default:
                errorMsg += error.message;
        }
        
        document.getElementById('loginMessage').innerHTML = errorMsg;
        console.error('Login error:', error);
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
});

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (auth.currentUser) {
        await db.collection('adminLogs').add({
            email: auth.currentUser.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            action: 'logout'
        });
    }
    await auth.signOut();
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
});

// Helper: get client IP (pake API eksternal)
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch {
        return 'unknown';
    }
}

// ========== CRUD PRODUCTS ==========

async function loadAdminProducts() {
    const tbody = document.getElementById('adminProductsList');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    
    try {
        const snapshot = await db.collection('products').get();
        tbody.innerHTML = '';
        
        snapshot.forEach(doc => {
            const product = doc.data();
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${escapeHtml(product.name)}</td>
                <td>Rp ${formatPrice(product.price)}</td>
                <td style="font-size:11px; max-width:200px; overflow:hidden;">${product.fileUrl ? '✓ Ada' : '-'}</td>
                <td>
                    <button class="btn-edit" onclick="editProduct('${doc.id}')">Edit</button>
                    <button class="btn-delete" onclick="deleteProduct('${doc.id}')">Hapus</button>
                </td>
            `;
        });
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = '<tr><td colspan="4">Error loading products</td></tr>';
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
document.getElementById('addProductBtn')?.addEventListener('click', () => {
    editingProductId = null;
    document.getElementById('modalTitle').innerText = 'Tambah Produk';
    document.getElementById('productForm').reset();
    document.getElementById('productFormModal').style.display = 'block';
});

// Submit form produk
document.getElementById('productForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('productName').value;
    const description = document.getElementById('productDesc').value;
    const price = parseInt(document.getElementById('productPrice').value);
    const fileUrl = document.getElementById('productFileUrl').value;
    const file = document.getElementById('productFile').files[0];
    
    let finalFileUrl = fileUrl;
    
    try {
        if (file) {
            const storageRef = storage.ref(`products/${Date.now()}_${file.name}`);
            await storageRef.put(file);
            finalFileUrl = await storageRef.getDownloadURL();
        }
        
        const productData = {
            name,
            description,
            price,
            fileUrl: finalFileUrl || '',
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
        await db.collection('adminLogs').add({
            email: auth.currentUser?.email,
            action: editingProductId ? 'update_product' : 'add_product',
            productName: name,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        closeModal('productFormModal');
        loadAdminProducts();
    } catch (error) {
        console.error('Error:', error);
        alert('Gagal menyimpan produk: ' + error.message);
    }
});

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
            // Ambil data produk dulu untuk log
            const productDoc = await db.collection('products').doc(id).get();
            const productName = productDoc.data()?.name;
            
            await db.collection('products').doc(id).delete();
            
            await db.collection('adminLogs').add({
                email: auth.currentUser?.email,
                action: 'delete_product',
                productName: productName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
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
