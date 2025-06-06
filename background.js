// background.js (修正版)

// 监听安装或更新事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('onInstalled event triggered. Reason:', details.reason);

  // 只在插件首次安装时进行初始化
  if (details.reason === 'install') {
    console.log('首次安装插件，正在进行初始化设置...');
    
    // 初始化屏蔽列表为空对象
    chrome.storage.sync.set({ blockedSites: {} });
    
    // 初始化时间追踪数据为空对象
    chrome.storage.local.set({ siteTimeTracking: {} });
  }

  // 无论安装还是更新，都要确保闹钟是存在的
  // chrome.alarms.create 是幂等的，如果同名闹钟已存在，它不会重复创建
  console.log('确保闹钟已设置...');
  
  // 创建每日重置闹钟
  chrome.alarms.create('dailyReset', {
    when: getNextMidnight(),
    periodInMinutes: 24 * 60
  });

  // 创建每分钟一次的计时闹钟
  chrome.alarms.create('timer', {
    periodInMinutes: 1
  });
});


// 监听所有闹钟
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'dailyReset') {
    console.log('午夜重置计时器...');
    // 这里只重置时间追踪数据，不触碰用户的屏蔽规则
    chrome.storage.local.set({ siteTimeTracking: {} }); 
  } else if (alarm.name === 'timer') {
    // console.log('每分钟计时器触发...'); // 这条日志太频繁，可以注释掉
    updateActiveTabTime();
  }
});

// **新的检查函数**：检查一个给定的 hostname 是否被屏蔽
// 返回被匹配到的屏蔽规则（例如 "bilibili.com"）
async function getBlockedRule(hostname) {
    if (!hostname) return null;

    const { blockedSites } = await chrome.storage.sync.get('blockedSites');
    if (!blockedSites) return null;

    // 先尝试精确匹配 (规范化后的)
    const normalizedHostnameToCheck = hostname.replace(/^www\./, '');
    if (blockedSites[normalizedHostnameToCheck]) {
        return normalizedHostnameToCheck;
    }
    
    // 检查父域名
    // 例如，如果屏蔽了 "bilibili.com"，那么 "live.bilibili.com" 也应该被匹配
    // 我们需要遍历 blockedSites 的 key，因为它们是规范化的
    for (const blockedSiteKey in blockedSites) {
        // 如果当前域名是屏蔽列表中的域名，或者以 ".屏蔽列表中的域名" 结尾
        if (normalizedHostnameToCheck === blockedSiteKey || normalizedHostnameToCheck.endsWith('.' + blockedSiteKey)) {
            return blockedSiteKey;
        }
    }
    
    return null;
}


// 当标签页更新时，立即检查是否需要屏蔽
// 这能提供更即时的屏蔽体验
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
        const hostname = new URL(tab.url).hostname;
        if (!hostname) return;

        const blockedRule = await getBlockedRule(hostname);
        if (blockedRule) {
            console.log(`Tab update: ${hostname} matches rule ${blockedRule}. Checking block status.`);
            await checkAndBlock(tabId, blockedRule);
        }
    } catch (e) { 
        // console.warn("Error processing tab update for URL:", tab.url, e); 
        /* 无效URL或内部URL，忽略 */ 
    }
  }
});


// 核心计时函数，由闹钟触发
async function updateActiveTabTime() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
        return; // 没有活动标签、URL，或者是浏览器内部页面
    }

    try {
        const hostname = new URL(activeTab.url).hostname;
        if (!hostname) return;

        const blockedRule = await getBlockedRule(hostname); // 使用新的检查函数

        if (blockedRule) {
            const { siteTimeTracking } = await chrome.storage.local.get('siteTimeTracking');
            const tracking = siteTimeTracking || {};
            
            // 使用匹配到的规则作为 key 进行计时
            tracking[blockedRule] = (tracking[blockedRule] || 0) + 60; // 增加60秒
            
            await chrome.storage.local.set({ siteTimeTracking: tracking });
            console.log(`在 ${blockedRule} 规则下花费时间: ${tracking[blockedRule]} 秒 (总计)`);

            // 更新后立即检查是否超时
            await checkAndBlock(activeTab.id, blockedRule);
        }
    } catch (e) { 
        // console.warn("Error processing active tab time for URL:", activeTab.url, e); 
        /* 无效URL，忽略 */ 
    }
}


// 检查并执行屏蔽的函数
async function checkAndBlock(tabId, blockedRule) {
    const { blockedSites } = await chrome.storage.sync.get('blockedSites');
    // 如果规则不存在或已被删除，则直接返回
    if (!blockedSites || !blockedSites[blockedRule]) {
        console.log(`Rule ${blockedRule} not found in blockedSites. Not blocking.`);
        return;
    }

    const { siteTimeTracking } = await chrome.storage.local.get('siteTimeTracking');
    const tracking = siteTimeTracking || {};

    const timeSpentInSeconds = tracking[blockedRule] || 0;
    const timeLimitInMinutes = blockedSites[blockedRule].limit; // 这是设置的限制分钟数
    const timeLimitInSeconds = timeLimitInMinutes * 60;

    console.log(`Checking ${blockedRule}: Spent ${timeSpentInSeconds}s, Limit ${timeLimitInSeconds}s (${timeLimitInMinutes} min)`);

    if (timeSpentInSeconds >= timeLimitInSeconds) {
        console.log(`域名匹配规则 "${blockedRule}" 已超时 (${timeSpentInSeconds}s >= ${timeLimitInSeconds}s)，正在屏蔽...`);
        try {
            const blockPageUrl = chrome.runtime.getURL('block_page.html');
            // --- MODIFICATION START ---
            // 将 timeLimitInMinutes (设置的限制)也传递过去
            const urlWithParams = `${blockPageUrl}?site=${encodeURIComponent(blockedRule)}&time=${timeSpentInSeconds}&limit=${timeLimitInMinutes}`;
            // --- MODIFICATION END ---
            await chrome.tabs.update(tabId, { url: urlWithParams });
        } catch (e) {
            if (e.message.includes("No tab with id") || e.message.includes("Invalid tab ID")) {
                console.warn(`Attempted to block tab ${tabId} for ${blockedRule}, but tab no longer exists.`);
            } else {
                console.error(`屏蔽页面失败 for ${blockedRule} on tab ${tabId}:`, e);
            }
        }
    }
}


function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // 第二天
    0, 0, 0, 0        // 0点0分0秒
  );
  return midnight.getTime();
}