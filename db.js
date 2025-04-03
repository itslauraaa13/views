// Gerenciamento do banco de dados IndexedDB
const DB_NAME = 'ViewsAppDB';
const DB_VERSION = 1;

// Estrutura do banco de dados
const DB_STRUCTURE = {
    users: { keyPath: 'id', indexes: ['username'] },
    videos: { keyPath: 'id', indexes: ['userId', 'folderId', 'favorite'] },
    folders: { keyPath: 'id', indexes: ['userId'] },
    favorites: { keyPath: 'id', indexes: ['userId', 'videoId'] }
};

// Classe para gerenciar o banco de dados
class Database {
    constructor() {
        this.db = null;
        this.init();
    }

    // Inicializar o banco de dados
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('Erro ao abrir o banco de dados:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('Banco de dados aberto com sucesso');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('Atualizando o banco de dados...');

                // Criar as stores (tabelas) se não existirem
                for (const [storeName, config] of Object.entries(DB_STRUCTURE)) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: config.keyPath });
                        
                        // Criar índices
                        if (config.indexes) {
                            config.indexes.forEach(indexName => {
                                store.createIndex(indexName, indexName, { unique: false });
                            });
                        }
                    }
                }
            };
        });
    }

    // Métodos para usuários
    async createUser(userData) {
        return this.add('users', {
            id: crypto.randomUUID(),
            username: userData.username,
            avatar: userData.avatar || 'default-avatar.png',
            createdAt: new Date().toISOString()
        });
    }

    async getUser(userId) {
        return this.get('users', userId);
    }

    async updateUser(userId, userData) {
        const user = await this.getUser(userId);
        if (!user) return null;
        
        return this.update('users', {
            ...user,
            ...userData
        });
    }

    // Métodos para vídeos
    async addVideo(videoData) {
        return this.add('videos', {
            id: crypto.randomUUID(),
            userId: videoData.userId,
            folderId: videoData.folderId || null,
            title: videoData.title || 'Sem título',
            url: videoData.url,
            thumbnail: videoData.thumbnail || null,
            duration: videoData.duration || 0,
            favorite: false,
            createdAt: new Date().toISOString()
        });
    }

    async getVideo(videoId) {
        return this.get('videos', videoId);
    }

    async getUserVideos(userId) {
        return this.getAllByIndex('videos', 'userId', userId);
    }

    async getFolderVideos(folderId) {
        return this.getAllByIndex('videos', 'folderId', folderId);
    }

    async getFavoriteVideos(userId) {
        return this.getAllByIndex('videos', 'favorite', true);
    }

    async toggleFavorite(videoId, userId) {
        const video = await this.getVideo(videoId);
        if (!video) return null;
        
        // Verificar se o vídeo pertence ao usuário
        if (video.userId !== userId) {
            // Se não pertence, adicionar ou remover dos favoritos
            const favorite = await this.getFavorite(userId, videoId);
            if (favorite) {
                await this.delete('favorites', favorite.id);
                return false;
            } else {
                await this.add('favorites', {
                    id: crypto.randomUUID(),
                    userId,
                    videoId,
                    createdAt: new Date().toISOString()
                });
                return true;
            }
        } else {
            // Se pertence, apenas alternar o estado
            return this.update('videos', {
                ...video,
                favorite: !video.favorite
            });
        }
    }

    async getFavorite(userId, videoId) {
        const favorites = await this.getAllByIndex('favorites', 'userId', userId);
        return favorites.find(f => f.videoId === videoId);
    }

    // Métodos para pastas
    async createFolder(folderData) {
        return this.add('folders', {
            id: crypto.randomUUID(),
            userId: folderData.userId,
            name: folderData.name,
            createdAt: new Date().toISOString()
        });
    }

    async getFolder(folderId) {
        return this.get('folders', folderId);
    }

    async getUserFolders(userId) {
        return this.getAllByIndex('folders', 'userId', userId);
    }

    async updateFolder(folderId, folderData) {
        const folder = await this.getFolder(folderId);
        if (!folder) return null;
        
        return this.update('folders', {
            ...folder,
            ...folderData
        });
    }

    async deleteFolder(folderId) {
        // Primeiro, mover todos os vídeos para fora da pasta
        const videos = await this.getFolderVideos(folderId);
        for (const video of videos) {
            await this.update('videos', {
                ...video,
                folderId: null
            });
        }
        
        // Depois, excluir a pasta
        return this.delete('folders', folderId);
    }

    // Métodos genéricos para operações no banco de dados
    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async update(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Criar uma instância global do banco de dados
const db = new Database();

// Exportar para uso em outros arquivos
window.db = db; 