// popup.js (修正版)

const form = document.getElementById('add-site-form');
const siteUrlInput = document.getElementById('site-url');
const timeLimitInput = document.getElementById('time-limit');
const blockedList = document.getElementById('blocked-sites-list');

// 规范化域名：移除协议、'www.'、路径等，只保留核心域名
function getCleanHostname(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }
    
    let hostname;
    try {
        // 先尝试在前面加上 http:// 来处理像 "youtube.com" 这样的输入
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            hostname = new URL('http://' + url).hostname;
        } else {
            hostname = new URL(url).hostname;
        }
    } catch (e) {
        // 如果 new URL 失败，说明输入不是一个有效的 URL 或域名
        console.error("无法解析输入的URL:", url);
        return null;
    }

    // 移除 www. 前缀
    hostname = hostname.replace(/^www\./, '');

    // 检查结果是否是一个有效的域名（至少包含一个点）
    if (hostname && hostname.includes('.')) {
        return hostname;
    }
    
    return null; // 如果不是有效域名，返回 null
}

// 加载并显示已保存的屏蔽列表
function loadBlockedSites() {
  chrome.storage.sync.get('blockedSites', (data) => {
    const sites = data.blockedSites || {};
    blockedList.innerHTML = ''; // 清空现有列表
    // 对 key 进行排序，让列表显示更稳定
    const sortedSites = Object.keys(sites).sort();

    for (const site of sortedSites) {
      const li = document.createElement('li');
      li.textContent = `${site} (${sites[site].limit} 分钟/天)`;
      
      const removeButton = document.createElement('button');
      removeButton.textContent = '删除';
      removeButton.onclick = () => removeSite(site);
      
      li.appendChild(removeButton);
      blockedList.appendChild(li);
    }
  });
}

// 添加或更新网站
form.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const site = getCleanHostname(siteUrlInput.value);
  const limit = parseInt(timeLimitInput.value, 10);

  // ** 关键验证 **
  if (site && limit >= 0) {
    chrome.storage.sync.get('blockedSites', (data) => {
      const sites = data.blockedSites || {};
      sites[site] = { limit: limit };
      
      chrome.storage.sync.set({ blockedSites: sites }, () => {
        siteUrlInput.value = '';
        timeLimitInput.value = '';
        loadBlockedSites(); // 重新加载列表
        // 可以在这里通知 background.js 配置已更新（如果需要立即生效）
      });
    });
  } else {
    // 如果输入无效，给用户提示
    alert("请输入一个有效的网站域名（例如 'youtube.com'）和一个大于0的分钟数。");
  }
});

// 删除网站
function removeSite(siteToRemove) {
  chrome.storage.sync.get('blockedSites', (data) => {
    const sites = data.blockedSites || {};
    delete sites[siteToRemove];
    chrome.storage.sync.set({ blockedSites: sites }, () => {
      chrome.storage.local.get('siteTimeTracking', (trackingData) => {
          const tracking = trackingData.siteTimeTracking || {};
          delete tracking[siteToRemove];
          chrome.storage.local.set({siteTimeTracking: tracking}, () => {
              loadBlockedSites(); // 重新加载列表
          });
      });
    });
  });
}

// 页面加载时执行
document.addEventListener('DOMContentLoaded', loadBlockedSites);