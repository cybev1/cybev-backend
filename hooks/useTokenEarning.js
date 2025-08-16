import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

// Token earning rates for reference
const EARNING_RATES = {
  'post_create': 5,
  'post_like': 1,
  'post_comment': 2,
  'post_share': 3,
  'blog_create': 25,
  'nft_mint': 10,
  'daily_login': 1,
  'referral': 50,
  'content_view': 0.1,
  'ai_content_generation': 2,
  'profile_complete': 10,
  'email_verify': 5,
  'first_post': 15
};

export function useTokenEarning() {
  const [isEarning, setIsEarning] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [earningHistory, setEarningHistory] = useState([]);

  // Load earning history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('cybev_earning_history');
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        setEarningHistory(history);
        
        // Calculate total earned from history
        const total = history.reduce((sum, earning) => sum + earning.amount, 0);
        setTotalEarned(total);
      } catch (error) {
        console.error('Error loading earning history:', error);
      }
    }
  }, []);

  // Save earning to history
  const saveEarningToHistory = useCallback((earning) => {
    const newEarning = {
      id: Date.now(),
      ...earning,
      timestamp: new Date().toISOString()
    };

    const updatedHistory = [newEarning, ...earningHistory.slice(0, 49)]; // Keep last 50
    setEarningHistory(updatedHistory);
    setTotalEarned(prev => prev + earning.amount);
    
    // Save to localStorage
    localStorage.setItem('cybev_earning_history', JSON.stringify(updatedHistory));
  }, [earningHistory]);

  // Main earn tokens function
  const earnTokens = useCallback(async (action, metadata = {}) => {
    if (isEarning) return; // Prevent duplicate calls
    
    setIsEarning(true);
    
    try {
      const token = localStorage.getItem('cybev_token');
      const wallet = localStorage.getItem('cybev_wallet');
      
      if (!token && !wallet) {
        // User not logged in, show info toast
        toast.info(`Sign up to earn ${EARNING_RATES[action] || 0} CYBV tokens for ${action.replace('_', ' ')}!`);
        return null;
      }

      const response = await axios.post('/api/token/earn', {
        action,
        wallet,
        metadata
      }, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (response.data.success && response.data.earned > 0) {
        const earning = {
          action,
          amount: response.data.earned,
          message: response.data.message,
          metadata
        };

        // Save to history
        saveEarningToHistory(earning);

        // Show earning notification
        showEarningNotification(response.data.earned, action);

        // Update balance in localStorage
        const currentBalance = parseFloat(localStorage.getItem('cybev_balance') || '0');
        localStorage.setItem('cybev_balance', (currentBalance + response.data.earned).toString());

        return earning;
      } else if (response.data.note) {
        // Demo mode or limit reached
        toast.info(response.data.note);
        return null;
      }

    } catch (error) {
      console.error('Token earning error:', error);
      
      if (error.response?.status === 429) {
        toast.warn('Daily limit reached for this action. Try again tomorrow!');
      } else if (error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error('Failed to earn tokens');
      }
      
      return null;
    } finally {
      setIsEarning(false);
    }
  }, [isEarning, saveEarningToHistory]);

  // Show earning notification with animation
  const showEarningNotification = useCallback((amount, action) => {
    // Custom toast with earning animation
    toast.success(
      <div className="flex items-center gap-2">
        <span className="text-2xl animate-bounce">🎉</span>
        <div>
          <div className="font-semibold">+{amount} CYBV earned!</div>
          <div className="text-sm opacity-75">{action.replace('_', ' ')}</div>
        </div>
      </div>,
      {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      }
    );

    // Trigger floating animation if element exists
    triggerFloatingEarning(amount);
  }, []);

  // Floating earning animation (optional)
  const triggerFloatingEarning = useCallback((amount) => {
    try {
      const floatingElement = document.createElement('div');
      floatingElement.className = 'fixed z-50 pointer-events-none text-green-500 font-bold text-lg';
      floatingElement.style.left = '50%';
      floatingElement.style.top = '50%';
      floatingElement.style.transform = 'translate(-50%, -50%)';
      floatingElement.textContent = `+${amount} CYBV`;
      
      document.body.appendChild(floatingElement);
      
      // Animate upward
      floatingElement.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: 'translate(-50%, -150px) scale(1.2)', opacity: 0 }
      ], {
        duration: 2000,
        easing: 'ease-out'
      }).addEventListener('finish', () => {
        document.body.removeChild(floatingElement);
      });
    } catch (error) {
      // Ignore animation errors
    }
  }, []);

  // Convenience functions for common actions
  const earnForPost = useCallback((postId) => {
    return earnTokens('post_create', { postId });
  }, [earnTokens]);

  const earnForLike = useCallback((postId) => {
    return earnTokens('post_like', { postId });
  }, [earnTokens]);

  const earnForComment = useCallback((postId, commentText) => {
    return earnTokens('post_comment', { postId, commentLength: commentText.length });
  }, [earnTokens]);

  const earnForShare = useCallback((postId) => {
    return earnTokens('post_share', { postId });
  }, [earnTokens]);

  const earnForBlog = useCallback((blogId) => {
    return earnTokens('blog_create', { blogId });
  }, [earnTokens]);

  const earnForNFT = useCallback((nftId) => {
    return earnTokens('nft_mint', { nftId });
  }, [earnTokens]);

  const earnForDailyLogin = useCallback(() => {
    // Check if already earned today
    const today = new Date().toDateString();
    const todayEarning = earningHistory.find(earning => 
      earning.action === 'daily_login' && 
      new Date(earning.timestamp).toDateString() === today
    );
    
    if (todayEarning) {
      toast.info('Already claimed daily login bonus today!');
      return null;
    }
    
    return earnTokens('daily_login');
  }, [earnTokens, earningHistory]);

  const earnForReferral = useCallback((referredUserId) => {
    return earnTokens('referral', { referredUserId });
  }, [earnTokens]);

  const earnForAI = useCallback((contentType, promptLength) => {
    return earnTokens('ai_content_generation', { contentType, promptLength });
  }, [earnTokens]);

  // Get earning stats
  const getEarningStats = useCallback(() => {
    const stats = {
      totalEarned,
      totalTransactions: earningHistory.length,
      todayEarned: 0,
      weekEarned: 0,
      mostEarnedAction: '',
      streak: 0
    };

    if (earningHistory.length === 0) return stats;

    const now = new Date();
    const today = now.toDateString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Calculate today's earnings
    stats.todayEarned = earningHistory
      .filter(earning => new Date(earning.timestamp).toDateString() === today)
      .reduce((sum, earning) => sum + earning.amount, 0);

    // Calculate week's earnings
    stats.weekEarned = earningHistory
      .filter(earning => new Date(earning.timestamp) >= weekAgo)
      .reduce((sum, earning) => sum + earning.amount, 0);

    // Find most earned action
    const actionCounts = {};
    earningHistory.forEach(earning => {
      actionCounts[earning.action] = (actionCounts[earning.action] || 0) + earning.amount;
    });
    
    stats.mostEarnedAction = Object.keys(actionCounts).reduce((a, b) => 
      actionCounts[a] > actionCounts[b] ? a : b, ''
    );

    // Calculate daily login streak
    let streak = 0;
    const dailyLogins = earningHistory
      .filter(earning => earning.action === 'daily_login')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    for (let i = 0; i < dailyLogins.length; i++) {
      const loginDate = new Date(dailyLogins[i].timestamp);
      const expectedDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      
      if (loginDate.toDateString() === expectedDate.toDateString()) {
        streak++;
      } else {
        break;
      }
    }
    
    stats.streak = streak;

    return stats;
  }, [totalEarned, earningHistory]);

  // Check if action can be performed (daily limits)
  const canEarn = useCallback((action) => {
    const today = new Date().toDateString();
    const todayEarnings = earningHistory.filter(earning => 
      new Date(earning.timestamp).toDateString() === today && 
      earning.action === action
    );

    const dailyLimits = {
      'post_like': 50,
      'post_comment': 20,
      'post_share': 10,
      'daily_login': 1,
      'content_view': 100
    };

    const limit = dailyLimits[action];
    if (!limit) return true; // No limit for this action
    
    return todayEarnings.length < limit;
  }, [earningHistory]);

  return {
    // Main functions
    earnTokens,
    
    // Convenience functions
    earnForPost,
    earnForLike,
    earnForComment,
    earnForShare,
    earnForBlog,
    earnForNFT,
    earnForDailyLogin,
    earnForReferral,
    earnForAI,
    
    // State
    isEarning,
    totalEarned,
    earningHistory,
    
    // Utilities
    getEarningStats,
    canEarn,
    EARNING_RATES
  };
}

export default useTokenEarning;
