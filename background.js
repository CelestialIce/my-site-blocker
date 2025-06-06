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
// 规范化域名，移除'www.'等
function getNormalizedHostname(url) {
    if (!url) return null;
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    } catch (e) {
        return null;
    }
}


// 当标签页更新时，立即检查是否需要屏蔽
// 这能提供更即时的屏蔽体验
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const hostname = getNormalizedHostname(tab.url);
    if (hostname) {
        checkAndBlock(tabId, hostname);
    }
  }
});

// 核心计时函数，由闹钟触发
async function updateActiveTabTime() {
    // 获取当前窗口中活动的标签页
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab || !activeTab.url) {
        return; // 没有活动标签或URL
    }

    const hostname = getNormalizedHostname(activeTab.url);
    if (!hostname) return;

    const { blockedSites } = await chrome.storage.sync.get('blockedSites');
    
    // 如果当前网站在屏蔽列表中
    if (blockedSites && blockedSites[hostname]) {
        const { siteTimeTracking } = await chrome.storage.local.get('siteTimeTracking');
        const tracking = siteTimeTracking || {};
        
        // 增加60秒 (因为闹钟每分钟响一次)
        tracking[hostname] = (tracking[hostname] || 0) + 60;
        
        await chrome.storage.local.set({ siteTimeTracking: tracking });
        console.log(`在 ${hostname} 上花费时间: ${tracking[hostname]} 秒`);

        // 更新后立即检查是否超时
        await checkAndBlock(activeTab.id, hostname);
    }
}

// 检查并执行屏蔽的函数
async function checkAndBlock(tabId, hostname) {
    const { blockedSites } = await chrome.storage.sync.get('blockedSites');
    if (!blockedSites || !blockedSites[hostname]) return;

    const { siteTimeTracking } = await chrome.storage.local.get('siteTimeTracking');
    const tracking = siteTimeTracking || {};

    const timeSpent = tracking[hostname] || 0;
    const timeLimitInSeconds = blockedSites[hostname].limit * 60;

    if (timeSpent >= timeLimitInSeconds) {
        console.log(`${hostname} 已超时，正在屏蔽...`);
        // 使用 await 确保更新操作被执行
        await chrome.tabs.update(tabId, { url: chrome.runtime.getURL('block_page.html') });
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

// **新的检查函数**：检查一个给定的 hostname 是否被屏蔽
// 返回被匹配到的屏蔽规则（例如 "bilibili.com"）
async function getBlockedRule(hostname) {
    if (!hostname) return null;

    const { blockedSites } = await chrome.storage.sync.get('blockedSites');
    if (!blockedSites) return null;

    // 先尝试精确匹配
    if (blockedSites[hostname]) {
        return hostname;
    }

    // 如果精确匹配失败，尝试模糊匹配
    // 例如，如果屏蔽了 "bilibili.com"，那么 "www.bilibili.com" 也应该被匹配
    const normalizedHostname = hostname.replace(/^www\./, '');
    if (blockedSites[normalizedHostname]) {
        return normalizedHostname;
    }
    
    // 更进一步，检查父域名
    for (const blockedSite in blockedSites) {
        if (hostname.endsWith('.' + blockedSite) || hostname === blockedSite) {
            return blockedSite;
        }
    }
    
    return null;
}


// 当标签页更新时，立即检查是否需要屏蔽
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
        const hostname = new URL(tab.url).hostname;
        const blockedRule = await getBlockedRule(hostname);
        if (blockedRule) {
            await checkAndBlock(tabId, blockedRule);
        }
    } catch (e) { /* 无效URL，忽略 */ }
  }
});


// 核心计时函数，由闹钟触发
async function updateActiveTabTime() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url) return;

    try {
        const hostname = new URL(activeTab.url).hostname;
        const blockedRule = await getBlockedRule(hostname); // 使用新的检查函数

        if (blockedRule) {
            const { siteTimeTracking } = await chrome.storage.local.get('siteTimeTracking');
            const tracking = siteTimeTracking || {};
            
            // 使用匹配到的规则作为 key 进行计时
            tracking[blockedRule] = (tracking[blockedRule] || 0) + 60; // 增加60秒
            
            await chrome.storage.local.set({ siteTimeTracking: tracking });
            console.log(`在 ${blockedRule} 规则下花费时间: ${tracking[blockedRule]} 秒`);

            // 更新后立即检查是否超时
            await checkAndBlock(activeTab.id, blockedRule);
        }
    } catch (e) { /* 无效URL，忽略 */ }
}


// 检查并执行屏蔽的函数
async function checkAndBlock(tabId, blockedRule) {
    const { blockedSites } = await chrome.storage.sync.get('blockedSites');
    // 如果规则不存在或已被删除，则直接返回
    if (!blockedSites || !blockedSites[blockedRule]) return;

    const { siteTimeTracking } = await chrome.storage.local.get('siteTimeTracking');
    const tracking = siteTimeTracking || {};

    const timeSpent = tracking[blockedRule] || 0;
    const timeLimitInSeconds = blockedSites[blockedRule].limit * 60;

    if (timeSpent >= timeLimitInSeconds) {
        console.log(`域名匹配规则 "${blockedRule}" 已超时，正在屏蔽...`);
        try {
            await chrome.tabs.update(tabId, { url: chrome.runtime.getURL('block_page.html') });
        } catch (e) {
            console.error("屏蔽页面失败:", e);
        }
    }
}