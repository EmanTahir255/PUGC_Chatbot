document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-plan-id]').forEach(planButton => {
        planButton.addEventListener('click', () => {
            const planId = planButton.dataset.planId;
            const plan = SubscriptionService.PLANS[planId] || SubscriptionService.PLANS.monthly;

            localStorage.setItem('selectedSubscriptionPlan', JSON.stringify(plan));
            window.location.href = 'checkout.html';
        });
    });
});
