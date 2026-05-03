/**
 * CustomModal Utility
 * Provides polished, glassmorphism-inspired dialogs.
 */
class CustomModal {
    static escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    static confirm(title, message, options = {}) {
        const { confirmText = 'Confirm', cancelText = 'Cancel', type = 'warning' } = options;
        const esc = CustomModal.escapeHtml;
        
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'custom-modal-backdrop';
            
            const isDanger = type === 'danger';
            const icon = isDanger ? 'fa-triangle-exclamation' : 'fa-circle-question';
            
            backdrop.innerHTML = `
                <div class="custom-modal-container">
                    <div class="modal-icon-wrapper ${isDanger ? 'danger' : ''}">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <h3>${esc(title)}</h3>
                    <p>${esc(message)}</p>
                    <div class="modal-footer">
                        <button class="modal-btn cancel-btn" id="modalCancelBtn">${esc(cancelText)}</button>
                        <button class="modal-btn ${isDanger ? 'danger-btn' : 'confirm-btn'}" id="modalConfirmBtn">${esc(confirmText)}</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(backdrop);
            setTimeout(() => backdrop.classList.add('active'), 10);
            
            const cleanup = (result) => {
                backdrop.classList.remove('active');
                setTimeout(() => {
                    if (backdrop.parentNode) document.body.removeChild(backdrop);
                    resolve(result);
                }, 300);
            };
            
            backdrop.querySelector('#modalConfirmBtn').addEventListener('click', () => cleanup(true));
            backdrop.querySelector('#modalCancelBtn').addEventListener('click', () => cleanup(false));
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
        });
    }

    static alert(title, message, options = {}) {
        const { confirmText = 'OK', type = 'info' } = options;
        const esc = CustomModal.escapeHtml;
        
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'custom-modal-backdrop';
            
            let icon = 'fa-circle-info';
            let iconClass = '';
            if (type === 'success') { icon = 'fa-circle-check'; iconClass = 'success'; }
            if (type === 'warning') { icon = 'fa-circle-exclamation'; iconClass = 'warning'; }
            if (type === 'danger') { icon = 'fa-triangle-exclamation'; iconClass = 'danger'; }
            
            backdrop.innerHTML = `
                <div class="custom-modal-container">
                    <div class="modal-icon-wrapper ${iconClass}">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <h3>${esc(title)}</h3>
                    <p>${esc(message)}</p>
                    <div class="modal-footer">
                        <button class="modal-btn confirm-btn" id="modalOkBtn">${esc(confirmText)}</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(backdrop);
            setTimeout(() => backdrop.classList.add('active'), 10);
            
            const cleanup = () => {
                backdrop.classList.remove('active');
                setTimeout(() => {
                    if (backdrop.parentNode) document.body.removeChild(backdrop);
                    resolve();
                }, 300);
            };
            
            backdrop.querySelector('#modalOkBtn').addEventListener('click', cleanup);
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });
        });
    }

    static prompt(title, message, options = {}) {
        const { confirmText = 'Submit', cancelText = 'Cancel', defaultValue = '', placeholder = '' } = options;
        const esc = CustomModal.escapeHtml;
        
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'custom-modal-backdrop';
            
            backdrop.innerHTML = `
                <div class="custom-modal-container">
                    <div class="modal-icon-wrapper">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </div>
                    <h3>${esc(title)}</h3>
                    <p>${esc(message)}</p>
                    <div class="modal-input-wrapper" style="margin-bottom: 25px;">
                        <textarea id="modalPromptInput" 
                                  style="width: 100%; padding: 12px; border: 1px solid #dbe2ef; border-radius: 10px; font-family: inherit; font-size: 0.95rem; box-sizing: border-box; min-height: 100px; outline: none;" 
                                  placeholder="${esc(placeholder)}">${esc(defaultValue)}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn cancel-btn" id="modalCancelBtn">${esc(cancelText)}</button>
                        <button class="modal-btn confirm-btn" id="modalConfirmBtn">${esc(confirmText)}</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(backdrop);
            setTimeout(() => {
                backdrop.classList.add('active');
                backdrop.querySelector('#modalPromptInput').focus();
            }, 10);
            
            const cleanup = (result) => {
                backdrop.classList.remove('active');
                setTimeout(() => {
                    if (backdrop.parentNode) document.body.removeChild(backdrop);
                    resolve(result);
                }, 300);
            };
            
            backdrop.querySelector('#modalConfirmBtn').addEventListener('click', () => {
                const value = backdrop.querySelector('#modalPromptInput').value.trim();
                cleanup(value);
            });
            backdrop.querySelector('#modalCancelBtn').addEventListener('click', () => cleanup(null));
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(null); });
        });
    }
}

// Global expose
window.CustomModal = CustomModal;
