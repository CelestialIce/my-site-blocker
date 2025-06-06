document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const site = urlParams.get('site');
  const timeSpentSecondsParam = urlParams.get('time');
  const limitInMinutesParam = urlParams.get('limit'); // 获取设置的限制时间
  const messageElement = document.getElementById('time-spent-message');

  if (site) {
    const decodedSite = decodeURIComponent(site);
    const limitInMinutes = parseInt(limitInMinutesParam, 10);

    if (!isNaN(limitInMinutes) && limitInMinutes === 0) {
      messageElement.textContent = `"${decodedSite}" 没有访问限额，就是不让你看！`;
    } else {
      // 对于非零限额，或者限额参数无效/缺失的情况，显示已花费时间
      const timeSpentSeconds = parseInt(timeSpentSecondsParam, 10);
      if (!isNaN(timeSpentSeconds)) {
        const timeSpentMinutes = Math.round(timeSpentSeconds / 60);
        messageElement.textContent = `你今天已经在 "${decodedSite}" 上花费了 ${timeSpentMinutes} 分钟啦。`;
      } else {
        // 如果花费时间也无效（理论上不应发生，但作为兜底）
        messageElement.textContent = `"${decodedSite}" 已被屏蔽，无法显示具体用时。`;
      }
    }
  } else {
    messageElement.textContent = '无法获取详细的屏蔽信息。';
  }
});