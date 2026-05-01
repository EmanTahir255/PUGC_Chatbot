document.addEventListener('DOMContentLoaded', () => {
    const backButton = document.getElementById('back-button');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const planSummary = document.getElementById('plan-summary');
    const totalAmount = document.getElementById('total-amount');
    const confirmPayment = document.getElementById('confirm-payment');
    const paymentMessage = document.getElementById('payment-message');
    const manualPaymentBox = document.getElementById('manual-payment-box');
    const manualMethodTitle = document.getElementById('manual-method-title');

    const currentUser = SubscriptionService.getCurrentUser();
    const selectedPlan = JSON.parse(localStorage.getItem('selectedSubscriptionPlan') || 'null') || SubscriptionService.PLANS.monthly;

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
        return document.querySelector('input[name="payment-method"]:checked')?.value || 'Demo Payment';
    }

    function updatePaymentMethodUI() {
        const method = getSelectedPaymentMethod();
        const isManual = method === 'Easypaisa' || method === 'JazzCash';

        manualPaymentBox.hidden = !isManual;
        manualMethodTitle.textContent = `${method} Manual Payment`;

        if (isManual) {
            setPaymentMessage('Manual methods are ready for admin verification later. For this FYP demo, payment will activate after you confirm.');
        } else {
            setPaymentMessage('Demo Payment activates the subscription instantly.');
        }
    }

    document.querySelectorAll('input[name="payment-method"]').forEach(input => {
        input.addEventListener('change', updatePaymentMethodUI);
    });

    confirmPayment?.addEventListener('click', async () => {
        if (!nameInput.value.trim()) {
            setPaymentMessage('Please enter your full name.', 'error');
            nameInput.focus();
            return;
        }

        if (!emailInput.value.trim()) {
            setPaymentMessage('Login email is required before subscription.', 'error');
            return;
        }

        confirmPayment.disabled = true;
        confirmPayment.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing';
        setPaymentMessage('Processing demo payment and sending confirmation email...');

        const paymentMethod = getSelectedPaymentMethod();
        const emailResult = await SubscriptionService.runDemoPayment(selectedPlan.id, paymentMethod);
        const subscription = SubscriptionService.activateSubscription(
            selectedPlan.id,
            paymentMethod,
            emailResult.payment || {}
        );

        SubscriptionService.addNotification(
            'success',
            'Subscription activated',
            `${subscription.planName} is active until ${SubscriptionService.formatDate(subscription.expiresAt)}.`,
            'premium.html'
        );

        if (emailResult.email?.sent) {
            setPaymentMessage('Payment successful. Confirmation email sent.', 'success');
        } else if (emailResult.email?.skipped) {
            setPaymentMessage('Payment successful. Email is ready but SMTP settings are missing in backend .env.', 'success');
        } else {
            setPaymentMessage('Payment successful. Email could not be sent because the backend/email service is not reachable.', 'success');
        }

        localStorage.removeItem('selectedSubscriptionPlan');

        window.setTimeout(() => {
            window.location.href = 'chatbot.html';
        }, 1400);
    });

    renderPlan();
    updatePaymentMethodUI();
});
