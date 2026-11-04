// dsh-mcp-connector EN UI patch (idempotent — safe to re-run after plugin updates)
// Re-applies: node ~/deepseek-harness-termux/patches/mcp-connector-en-patch.js
// Revert: cp lib/client.js.en.bak lib/client.js (backup is written on first run only)
const fs = require("fs");
const P = process.env.HOME + "/.dsh/profiles/web/node_modules/dsh-mcp-connector/";

const clientMap = [
  ["更新任务排队中…", "Update queued…"],
  ["正在更新…", "Updating…"],
  ["有任务正在运行，请结束后重试", "A task is already running; wait for it to finish and retry"],
  ["插件市场正在处理其他任务", "Plugin Market is processing another task"],
  ["新版本处于发布安全等待期（约 24 小时）", "New release is in its safety hold period (~24 hours)"],
  ["镜像尚未同步完整安装包", "Mirror has not synced the full package yet"],
  ["下载后版本未变化", "Version unchanged after download"],
  ["已阻止版本降级", "Downgrade blocked"],
  ["下载版本与预期不一致", "Downloaded version does not match the expected one"],
  ["更新服务未返回有效版本", "Update service returned no valid version"],
  ["更新超时", "Update timed out"],
  ["更新请求被拒绝", "Update request was rejected"],
  ["无法执行本次更新", "Unable to perform this update"],
  ["更新失败", "Update failed"],
  ["更新服务报告成功，但未返回有效的已安装版本", "Update service reported success but returned no valid installed version"],
  ["MCP连接器", "MCP Connector"],
  ["控制侧边栏入口和快捷打开方式。", "Controls the sidebar entry and quick access."],
  ["在侧边栏显示 MCP连接器", "Show MCP Connector in the sidebar"],
  ["关闭后只隐藏入口，不影响已连接的 MCP Server 和工具。", "Turning this off only hides the entry; connected MCP servers and tools are unaffected."],
  ["侧边栏入口当前显示。", "The sidebar entry is currently shown."],
  ["入口已隐藏，仍可从这里打开 MCP连接器。", "Entry is hidden; you can still open MCP Connector from here."],
  ["当前设置页只读。", "This settings page is read-only."],
  ["正在保存…", "Saving…"],
  ["设置未保存，请重试。", "Settings not saved; please retry."],
  ["恢复默认", "Reset to defaults"],
  ["打开 MCP连接器", "Open MCP Connector"],
  ["展开 MCP连接器设置", "Expand MCP Connector settings"],
  ["收起 MCP连接器设置", "Collapse MCP Connector settings"],
  ["Prompt 不能为空", "Prompt cannot be empty"],
  ["请先选择一个工作空间，再使用示例 Prompt", "Select a workspace first, then use the example Prompt"],
  ["当前 DSH 版本没有可用的工作区会话创建能力，请升级 DSH 后重试", "This DSH version cannot create workspace sessions; upgrade DSH and retry"],
  ["DSH 对话服务尚未就绪，请稍后重试", "DSH conversation service is not ready yet; try again shortly"],
  ["无效的 Prompt 请求", "Invalid Prompt request"],
  ["已带入新会话", "Carried into a new session"],
  ["正在启动更新…", "Starting update…"],
  ["暂时无法读取进度，正在重试", "Cannot read progress right now; retrying"],
  ["立即更新（跳过等待）", "Update now (skip wait)"],
  ["强制重试", "Force retry"],
  ["重试更新", "Retry update"],
  ["检测到异常版本，正在自动回滚…", "Abnormal version detected; auto-rolling back…"],
  ["查看更新方式", "View update instructions"],
  ["已回滚", "Rolled back"],
  ["已阻止异常版本并回滚", "Blocked abnormal version and rolled back"],
  ["回滚失败", "Rollback failed"],
  ["正在重启…", "Restarting…"],
  ["立即重启", "Restart now"],
  ["宿主", "Host"],
  ["请重启 DSH Desktop", "Please restart DSH Desktop"],
  ["请重启 DSH", "Please restart DSH"],
  ["刷新生效", "Reload to apply"],
  ["正在回滚…", "Rolling back…"],
  ["重试回滚", "Retry rollback"],
  ["回滚", "Rollback"],
  ["更新服务调用失败", "Update service call failed"],
  ["正在准备更新…", "Preparing update…"],
  ["已复制", "Copied"],
  ["复制升级命令", "Copy upgrade command"],
  ["无法写入剪贴板，请点击上方命令全选后手动复制", "Could not write to clipboard; select the command above and copy it manually"],
  ["查看 npm", "View on npm"],
  ["正在检查插件版本", "Checking plugin version"],
  ["尚未完成版本检查", "Version check not completed yet"],
  ["正在检查更新…", "Checking for updates…"],
  ["检查更新", "Check for updates"],
  ["插件 API 不可用，请检查 DSH 宿主兼容性或服务日志", "Plugin API unavailable; check DSH host compatibility or service logs"],
  ["暂时无法确认 npm 最新版本，请重试", "Cannot confirm the latest npm version right now; please retry"],
  ["GitHub Release 已发布，等待 npm 同步后即可更新", "GitHub release published; update will be available once npm syncs"],
  ["返回会话", "Back to session"],
  ["关闭 MCP连接器", "Close MCP Connector"],
  ["${label} 更新接口版本不兼容", "${label} update API version incompatible"],
  ["${label} 未返回更新任务编号", "${label} returned no update task id"],
  ["${label} 不支持回滚", "${label} does not support rollback"],
  ["${label} 不支持重启", "${label} does not support restart"],
  ["正在更新 ${percent}%", "Updating ${percent}%"],
  ["正在更新：${phase}", "Updating: ${phase}"],
  ["更新服务将插件从 v${before.normalized} 降级到 v${installed.normalized}", "Update service would downgrade the plugin from v${before.normalized} to v${installed.normalized}"],
  ["预期安装 v${expected.normalized}，更新服务实际安装了 v${installed.normalized}", "Expected v${expected.normalized} but the update service installed v${installed.normalized}"],
  ["已安装 v${updateOperation.installedVersion ?? versionStatus?.latestVersion}", "Installed v${updateOperation.installedVersion ?? versionStatus?.latestVersion}"],
  ["重启由 ${updateProviderSelection?.capabilities?.restart?.managedBy ?? \"宿主\"} 管理", "Restart is managed by ${updateProviderSelection?.capabilities?.restart?.managedBy ?? \"Host\"}"],
  ["由 ${updateProviderSelection?.provider?.label ?? \"更新服务\"} 安全更新到 v${providerUpdateCheck.latestVersion}", "Safe update to v${providerUpdateCheck.latestVersion} by ${updateProviderSelection?.provider?.label ?? \"the update service\"}"],
  ["一键更新到 v${providerUpdateCheck.latestVersion}", "One-click update to v${providerUpdateCheck.latestVersion}"],
  ["v${activationPendingVersion} 已安装，重启后生效", "v${activationPendingVersion} installed; takes effect after restart"],
  ["当前版本 v${versionStatus.installedVersion}", "Current version v${versionStatus.installedVersion}"],
  ["上次检查：${new Date(versionStatus.checkedAt).toLocaleString()}", "Last check: ${new Date(versionStatus.checkedAt).toLocaleString()}"],
  ["v${versionStatus.release.version} 正在同步", "v${versionStatus.release.version} is syncing"]
];

const catalogMap = [
  ["${fieldPath} 禁止携带凭证或密钥", "${fieldPath} must not carry credentials or keys"],
  ["connector \"${descriptor.id}\" auth.credentialFields key 重复: ${field.key}", "connector \"${descriptor.id}\" auth.credentialFields duplicate key: ${field.key}"],
  ["connector \"${descriptor.id}\" servers[].env 禁止携带密钥类变量: ${name}", "connector \"${descriptor.id}\" servers[].env must not carry secret-like variables: ${name}"],
  ["connector \"${descriptor.id}\" 的 OAuth stdio server 不能同时声明 credentialBindings", "connector \"${descriptor.id}\": OAuth stdio server cannot also declare credentialBindings"],
  ["connector \"${descriptor.id}\" 的 OAuth stdio server 必须声明 oauthResource 和 oauthTokenEnv", "connector \"${descriptor.id}\": OAuth stdio server must declare oauthResource and oauthTokenEnv"],
  ["connector \"${descriptor.id}\" 的 OAuth stdio oauthResource 必须引用同一连接器的 HTTP resource", "connector \"${descriptor.id}\": OAuth stdio oauthResource must reference an HTTP resource of the same connector"],
  ["connector \"${descriptor.id}\" oauthTokenEnv 环境变量名非法: ${server.oauthTokenEnv}", "connector \"${descriptor.id}\" oauthTokenEnv is not a valid env var name: ${server.oauthTokenEnv}"],
  ["connector \"${descriptor.id}\" oauthTokenEnv 与 servers[].env 重复声明: ${server.oauthTokenEnv}", "connector \"${descriptor.id}\" oauthTokenEnv is also declared in servers[].env: ${server.oauthTokenEnv}"],
  ["connector \"${descriptor.id}\" 只有 OAuth stdio server 可声明 oauthResource/oauthTokenEnv", "connector \"${descriptor.id}\": only OAuth stdio servers may declare oauthResource/oauthTokenEnv"],
  ["connector \"${descriptor.id}\" 的 stdio credentialBindings 需要 bearer/api-key 凭据定义", "connector \"${descriptor.id}\": stdio credentialBindings require bearer/api-key credential definitions"],
  ["connector \"${descriptor.id}\" 的凭据型 stdio server 必须声明 credentialBindings", "connector \"${descriptor.id}\": credential-based stdio server must declare credentialBindings"],
  ["connector \"${descriptor.id}\" credentialBindings 环境变量名非法: ${envName}", "connector \"${descriptor.id}\" credentialBindings is not a valid env var name: ${envName}"],
  ["connector \"${descriptor.id}\" credentialBindings 与 servers[].env 重复声明: ${envName}", "connector \"${descriptor.id}\" credentialBindings is also declared in servers[].env: ${envName}"],
  ["connector \"${descriptor.id}\" credentialBindings 引用了未知凭据字段: ${credentialKey}", "connector \"${descriptor.id}\" credentialBindings references an unknown credential field: ${credentialKey}"],
  ["connector \"${descriptor.id}\" oauthResource 必须与 server.url 同源: ${server.oauthResource}", "connector \"${descriptor.id}\" oauthResource must be same-origin with server.url: ${server.oauthResource}"],
  ["connector \"${descriptor.id}\" 只有 OAuth stdio server 可声明 oauthTokenEnv", "connector \"${descriptor.id}\": only OAuth stdio servers may declare oauthTokenEnv"],
  ["connector \"${descriptor.id}\" servers[].headers 禁止携带密钥类头: ${name}", "connector \"${descriptor.id}\" servers[].headers must not carry secret-like headers: ${name}"],
  ["connector \"${descriptor.id}\" 的 OAuth 授权至少需要一个 HTTP resource", "connector \"${descriptor.id}\": OAuth authorization requires at least one HTTP resource"],
  ["connector \"${descriptor.id}\" 必填凭据字段未被 HTTP 或 stdio 使用: ${field.key}", "connector \"${descriptor.id}\": required credential field is not used by HTTP or stdio: ${field.key}"],
  ["JSON 响应超过 ${maxBytes} bytes", "JSON response exceeds ${maxBytes} bytes"],
  ["JSON 解析失败: ${error instanceof Error ? error.message : String(error)}", "JSON parse failed: ${error instanceof Error ? error.message : String(error)}"]
];

function apply(file, map) {
  const path = P + file;
  const bak = path + ".en.bak";
  if (!fs.existsSync(bak)) fs.copyFileSync(path, bak);
  let s = fs.readFileSync(path, "utf8");
  const sorted = [...map].sort((a, b) => b[0].length - a[0].length);
  let total = 0; const misses = [];
  for (const [zh, en] of sorted) {
    const parts = s.split(zh);
    if (parts.length > 1) { total += parts.length - 1; s = parts.join(en); }
    else misses.push(zh);
  }
  fs.writeFileSync(path, s);
  console.log(file, "-> replaced:", total, "| unmatched (already EN or absent):", misses.length);
}

apply("lib/client.js", clientMap);
apply("lib/catalog.js", catalogMap);
console.log("done — Chinese UI strings translated; JSDoc comments left as-is (invisible).");
