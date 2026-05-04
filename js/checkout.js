document.addEventListener('DOMContentLoaded', () => {
    const SUBSCRIPTION_API_BASE = 'http://localhost:3000/api/subscription';
    const MAX_PROOF_SIZE_BYTES = 2 * 1024 * 1024;
    const PAYMENT_ACCOUNTS = {
        easypaisa: {
            title: 'Easypaisa Manual Payment',
            label: 'Easypaisa No.',
            value: '0300-0000000'
        },
        jazzcash: {
            title: 'JazzCash Manual Payment',
            label: 'JazzCash No.',
            value: '0300-0000000'
        },
        bank_transfer: {
            title: 'Bank Transfer',
            label: 'Account / IBAN',
            value: 'PK00-PUGC-000000000000'
        }
    };

    const backButton = document.getElementById('back-button');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const senderNameInput = document.getElementById('sender-name');
    const senderNumberInput = document.getElementById('sender-number');
    const transactionReferenceInput = document.getElementById('transaction-reference');
    const studentNoteInput = document.getElementById('student-note');
    const paymentProofInput = document.getElementById('payment-proof');
    const planSummary = document.getElementById('plan-summary');
    const totalAmount = document.getElementById('total-amount');
    const confirmPayment = document.getElementById('confirm-payment');
    const paymentMessage = document.getElementById('payment-message');
    const manualMethodTitle = document.getElementById('manual-method-title');
    const merchantLabel = document.getElementById('merchant-label');
    const merchantValue = document.getElementById('merchant-value');

    const checkoutStep1 = document.getElementById('checkout-step-1');
    const checkoutStep2 = document.getElementById('checkout-step-2');
    const backToStep1Button = document.getElementById('back-to-step-1');

    const currentUser = SubscriptionService.getCurrentUser();
    const selectedPlan = JSON.parse(localStorage.getItem('selectedSubscriptionPlan') || 'null') || SubscriptionService.PLANS.monthly;

    // Real-time restriction for account number
    senderNumberInput?.addEventListener('input', (e) => {
        const method = getSelectedPaymentMethod();
        if (method === 'easypaisa' || method === 'jazzcash') {
            // Strip non-numeric characters for mobile wallets
            e.target.value = e.target.value.replace(/\D/g, '');
        }
    });

    backButton?.addEventListener('click', () => {
        window.location.href = 'premium.html';
    });

    nameInput.value = currentUser.name || '';
    emailInput.value = currentUser.email || '';

    function renderPlan() {
        planSummary.innerHTML = `
            <div class="plan-summary-row">
                <div>
                    <h4>${selectedPlan.name}</h4>
                    <p>${selectedPlan.durationDays} days premium access, high chat limit, full history, event reminders, fee challan generator, and smart transcript request form generator.</p>
                </div>
                <strong>Rs. ${selectedPlan.price}</strong>
            </div>
        `;
        totalAmount.textContent = selectedPlan.price;
    }

    function setPaymentMessage(message, type = '') {
        paymentMessage.textContent = message;
        paymentMessage.className = `payment-message ${type}`.trim();
    }

    function getSelectedPaymentMethod() {
        return document.querySelector('input[name="payment-method"]:checked')?.value || 'easypaisa';
    }

    function updatePaymentMethodUI() {
        const method = getSelectedPaymentMethod();
        const account = PAYMENT_ACCOUNTS[method] || PAYMENT_ACCOUNTS.easypaisa;

        manualMethodTitle.textContent = account.title;
        merchantLabel.textContent = account.label;
        merchantValue.textContent = account.value;
        setPaymentMessage('Submit your payment details. Premium access starts after admin approval.');
        
        if (checkoutStep1 && checkoutStep2 && method) {
            checkoutStep1.style.display = 'none';
            checkoutStep2.style.display = 'block';
        }
    }

    backToStep1Button?.addEventListener('click', () => {
        if (checkoutStep1 && checkoutStep2) {
            checkoutStep2.style.display = 'none';
            checkoutStep1.style.display = 'block';
            document.querySelectorAll('input[name="payment-method"]').forEach(input => input.checked = false);
        }
    });

    function getAuthToken() {
        return window.AuthService?.getToken?.() || localStorage.getItem('authToken') || '';
    }

    function readProofFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                resolve(null);
                return;
            }

            if (!file.type.startsWith('image/')) {
                reject(new Error('Payment proof must be an image file.'));
                return;
            }

            if (file.size > MAX_PROOF_SIZE_BYTES) {
                reject(new Error('Payment proof image must be 2 MB or smaller.'));
                return;
            }

            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read payment proof image.'));
            reader.readAsDataURL(file);
        });
    }

    async function submitManualPayment(payload) {
        const response = await fetch(`${SUBSCRIPTION_API_BASE}/manual-payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(payload)
        });

        let body = {};
        try {
            body = await response.json();
        } catch (error) {
            body = {};
        }

        if (!response.ok) {
            const details = body.details || {};
            const firstDetail = Object.values(details)[0];
            throw new Error(firstDetail || body.error || 'Could not submit payment request.');
        }

        return body;
    }

    function validateManualPayment() {
        const nameRegex = /^[a-zA-Z\s]{3,50}$/;
        const referenceRegex = /^[a-zA-Z0-9-]{6,25}$/;
        const method = getSelectedPaymentMethod();

        if (!nameInput.value.trim() || !nameRegex.test(nameInput.value.trim())) {
            nameInput.focus();
            return 'Please enter a valid full name (3-50 letters only).';
        }

        if (!emailInput.value.trim()) {
            return 'Login email is required before subscription.';
        }

        if (!senderNameInput.value.trim() || !nameRegex.test(senderNameInput.value.trim())) {
            senderNameInput.focus();
            return 'Please enter a valid sender account name (3-50 letters only).';
        }

        const senderNumber = senderNumberInput.value.trim();
        if (!senderNumber) {
            senderNumberInput.focus();
            return 'Please enter sender account number.';
        }

        if (method === 'easypaisa' || method === 'jazzcash') {
            if (!/^03\d{9}$/.test(senderNumber)) {
                senderNumberInput.focus();
                return 'Please enter a valid 11-digit mobile number starting with 03.';
            }
        } else if (senderNumber.length < 10) {
            senderNumberInput.focus();
            return 'Please enter a valid account number or IBAN.';
        }

        if (!transactionReferenceInput.value.trim() || !referenceRegex.test(transactionReferenceInput.value.trim())) {
            transactionReferenceInput.focus();
            return 'Please enter a valid transaction reference (6-25 characters, alphanumeric).';
        }

        return '';
    }

    document.querySelectorAll('input[name="payment-method"]').forEach(input => {
        input.addEventListener('change', updatePaymentMethodUI);
    });

    confirmPayment?.addEventListener('click', async () => {
        const validationError = validateManualPayment();

        if (validationError) {
            setPaymentMessage(validationError, 'error');
            return;
        }

        const originalButtonHtml = confirmPayment.innerHTML;
        confirmPayment.disabled = true;
        confirmPayment.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting';
        setPaymentMessage('Submitting payment request for admin review...');

        try {
            const proofFile = paymentProofInput.files?.[0] || null;
            const proofDataUrl = await readProofFile(proofFile);
            const result = await submitManualPayment({
                planCode: selectedPlan.id,
                paymentMethod: getSelectedPaymentMethod(),
                senderAccountName: senderNameInput.value.trim(),
                senderAccountNumber: senderNumberInput.value.trim(),
                transactionReference: transactionReferenceInput.value.trim(),
                studentNote: studentNoteInput.value.trim(),
                proofOriginalName: proofFile?.name || null,
                proofDataUrl
            });

            if (SubscriptionService.refreshNotifications) {
                await SubscriptionService.refreshNotifications();
            } else {
                SubscriptionService.addNotification(
                    'info',
                    'Payment request submitted',
                    `${result.plan?.name || selectedPlan.name} is pending admin approval.`,
                    'premium.html'
                );
            }

            localStorage.removeItem('selectedSubscriptionPlan');
            setPaymentMessage('Payment request submitted. Admin approval is required before premium starts.', 'success');

            window.setTimeout(() => {
                window.location.href = 'premium.html';
            }, 1600);
        } catch (error) {
            confirmPayment.disabled = false;
            confirmPayment.innerHTML = originalButtonHtml;
            setPaymentMessage(error.message || 'Could not submit payment request.', 'error');
        }
    });

    async function checkSubscriptionStatus() {
        try {
            const [currentData, paymentsData] = await Promise.all([
                SubscriptionService.apiRequest('/subscription/current'),
                SubscriptionService.apiRequest('/subscription/manual-payments')
            ]);

            const subscription = currentData.subscription;
            const activePendingPayment = paymentsData.payments?.find(p => p.status === 'pending');

            if (subscription?.isPremium) {
                const expiryDate = new Date(subscription.expiresAt).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'long', year: 'numeric'
                });
                showStatusAlert(
                    'error',
                    'Active Subscription Found',
                    `You are already subscribed to the <strong>${subscription.planName}</strong> which expires on <strong>${expiryDate}</strong>. You can purchase a new plan once your current one expires.`
                );
                disableCheckout();
            } else if (activePendingPayment) {
                showStatusAlert(
                    'warning',
                    'Payment Request Pending',
                    `You already have a pending request for <strong>${activePendingPayment.planName}</strong> awaiting admin approval. Please wait for a decision before submitting another request.`
                );
                disableCheckout();
            }
        } catch (error) {
            console.error('Error checking subscription status:', error);
        }
    }

    function showStatusAlert(type, title, message) {
        const formPanel = document.querySelector('.checkout-form-panel');
        if (!formPanel) return;
        
        const alertHtml = `
            <div class="subscription-alert ${type}">
                <i class="fas ${type === 'error' ? 'fa-circle-xmark' : 'fa-triangle-exclamation'}"></i>
                <div class="alert-content">
                    <h4>${title}</h4>
                    <p>${message}</p>
                    <a href="premium.html" class="btn-link">Back to Plans</a>
                </div>
            </div>
        `;
        formPanel.insertAdjacentHTML('afterbegin', alertHtml);
    }

    function disableCheckout() {
        if (!confirmPayment) return;
        confirmPayment.disabled = true;
        confirmPayment.style.opacity = '0.5';
        confirmPayment.style.cursor = 'not-allowed';
        document.querySelectorAll('input[name="payment-method"]').forEach(input => {
            input.disabled = true;
        });
        const checkoutIntro = document.querySelector('.checkout-intro');
        if (checkoutIntro) checkoutIntro.textContent = 'Subscription checkout is currently locked for your account.';
    }

    renderPlan();
    checkSubscriptionStatus();
});
