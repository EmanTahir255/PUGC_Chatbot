/**
 * Premium Guard
 * Redirects non-premium users away from restricted pages.
 */
(function() {
    function checkAccess() {
        // Wait for SubscriptionService to be available
        if (!window.SubscriptionService) {
            console.warn('SubscriptionService not found, retrying in 100ms...');
            setTimeout(checkAccess, 100);
            return;
        }

        const isPremium = window.SubscriptionService.isPremium();
        
        if (!isPremium) {
            console.log('Access Denied: Premium subscription required for this page.');
            // Show a friendly alert before redirecting
            window.CustomModal.confirm('Premium Feature', 'This feature is only available for Weekly and Monthly premium subscribers. Would you like to upgrade now?', {
                confirmText: 'View Plans',
                cancelText: 'Maybe Later'
            }).then(confirmed => {
                window.location.href = 'premium.html';
            });
        }
    }

    // Run on load
    if (document.readyState === 'complete') checkAccess();
    else window.addEventListener('load', checkAccess);
})();
