// Konfigurasi Firebase - SAMA DENGAN script.js
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

let editingProductId = null;

// Auth state observer
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        loadAdminProducts();
    } else {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
    }
});

// Login
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        alert('Login berhasil!');
    } catch (error) {
        alert('Login gagal: ' + error.message);
    }
});

// Register
document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        alert('Registrasi berhasil! Silakan login.');
        document.getElementById('registerForm').style.display = 'none';
    } catch (error) {
        alert('Registrasi gagal: ' + error.message);
    }
});

// Toggle register form
document.getElementById('showRegisterBtn')?.addEventListener('click', () => {
    const form = document.getElementById('registerForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
});

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await auth.signOut();
    alert('Logout berhasil');
});

// Load produk untuk admin
async function loadAdminProducts() {
    const tbody = document.getElementById('adminProductsList');
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    
    try {
        const snapshot = await db.collection('products').get();
        tbody.innerHTML = '';
        
        snapshot.forEach(doc => {
            const product = doc.data();
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${product.name}</td>
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
        // Upload file jika ada
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
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (editingProductId) {
            await db.collection('products').doc(editingProductId).update(productData);
            alert('Produk berhasil diupdate!');
        } else {
            await db.collection('products').add(productData);
            alert('Produk berhasil ditambahkan!');
        }
        
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
    if (confirm('Yakin ingin menghapus produk ini?')) {
        try {
            await db.collection('products').doc(id).delete();
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