// popup.js (功能增强版)

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
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            hostname = new URL('http://' + url).hostname;
        } else {
            hostname = new URL(url).hostname;
        }
    } catch (e) {
        console.error("无法解析输入的URL:", url);
        return null;
    }

    hostname = hostname.replace(/^www\./, '');

    if (hostname && hostname.includes('.')) {
        return hostname;
    }
    
    return null;
}

// --- 修改后的核心函数 ---
// 加载并显示已保存的屏蔽列表以及今日用时
async function loadBlockedSites() {
  // 使用 Promise.all 并行获取 sync 和 local 的数据，效率更高
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get('blockedSites'),
    chrome.storage.local.get('siteTimeTracking')
  ]);

  const sites = syncData.blockedSites || {};
  const tracking = localData.siteTimeTracking || {};
  
  blockedList.innerHTML = ''; // 清空现有列表
  
  const sortedSites = Object.keys(sites).sort();

  if (sortedSites.length === 0) {
      const li = document.createElement('li');
      li.textContent = '暂无屏蔽网站';
      li.style.justifyContent = 'center';
      blockedList.appendChild(li);
      return;
  }

  for (const site of sortedSites) {
    const li = document.createElement('li');
    
    // 获取已用时间（秒），如果没记录则为0
    const timeSpentInSeconds = tracking[site] || 0;
    // 转换为分钟
    const timeSpentInMinutes = Math.floor(timeSpentInSeconds / 60);
    const limitInMinutes = sites[site].limit;
    
    // 创建显示信息的 span
    const infoSpan = document.createElement('span');
    infoSpan.textContent = `${site} (已用 ${timeSpentInMinutes} / ${limitInMinutes} 分钟)`;
    
    const removeButton = document.createElement('button');
    removeButton.textContent = '删除';
    removeButton.onclick = () => removeSite(site);
    
    li.appendChild(infoSpan);
    li.appendChild(removeButton);
    blockedList.appendChild(li);
  }
}

// 添加或更新网站
form.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const site = getCleanHostname(siteUrlInput.value);
  const limit = parseInt(timeLimitInput.value, 10);

  if (site && limit >= 0) {
    chrome.storage.sync.get('blockedSites', (data) => {
      const sites = data.blockedSites || {};
      sites[site] = { limit: limit };
      
      chrome.storage.sync.set({ blockedSites: sites }, () => {
        siteUrlInput.value = '';
        timeLimitInput.value = '';
        loadBlockedSites(); // 重新加载列表
      });
    });
  } else {
    alert("请输入一个有效的网站域名（例如 'youtube.com'）和一个大于或等于0的分钟数。");
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