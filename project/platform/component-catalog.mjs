import {installedExtensions,extensionFile} from './extension-registry.mjs'
// Only these files can be replaced by an independent component package.
export const componentTitles={reports:'گزارش‌ساز هوشمند',tariff:'محاسبه‌گر تعرفه نیرو و خدمات',market:'میزکار دفتر بازاریابی و فروش',chat:'دستیار هوشمند',pricing:'محاسبه‌گر قیمت',crm:'دستیار قائم‌مقام مدیرعامل',home:'خانه'}
const publicFiles={
 reports:['reports.html','reports.css','reports-ui.mjs','reports-view.mjs','reports-format.mjs','reports-statistics.mjs','reports-chat.mjs','reports-icon.svg'],
 tariff:['tariff-shell.mjs','tariff-shell.css','tariff-icon.svg'],
 market:['market.html','market-shell.mjs','market-shell.css','market-embedded.css','market-icon.svg','market-workspace.js','market-permission-client.js','market-office.html','market-office.js','market-office.css','market-suggestion.mjs','market-reports.mjs','market-dialog-host.mjs','market-record-loading.css','market-account-detail.css'],
 pricing:['pricing-proposal-import.js','pricing-proposal-file.mjs','pricing.html','pricing-shell.mjs','pricing-shell.css','pricing-embedded.css','pricing-icon.svg'],
 crm:['dashboard-dialogs.css','dashboard-integration.js','dashboard.html','dashboard-shell.mjs','dashboard-shell.css','dashboard-embedded.css','dashboard-availability.js','dashboard-chat.mjs','dashboard-icon.svg'],
 home:['home.html','home.mjs','home.css','organization-account-ui.mjs'],
 chat:['chat-sources.mjs','chat-display.mjs','personal-files.mjs','personal-files.css','index.html','app.js','chat.css','chat-embed.css','chat-icons.mjs','chat-layout.mjs','conversation-list.mjs','new-chat-menu.mjs','source-picker.mjs','render.mjs','sync-feedback.mjs','quota-state.mjs','answer-export.mjs']
}
const chatModules=['model-tool-response.mjs','crm-answer-agent.mjs','answer-grounding.mjs','search-depth.mjs','chat-all-sources.mjs','chat-all-policy.mjs','chat-history-view.mjs','personal-files.mjs','personal-files-http.mjs','personal-file-extraction.mjs','personal-file-policy.mjs','chat-cancellation.mjs','chat-jobs.mjs','chat-account.mjs','chat-context.mjs','retrieval.mjs','notion-retrieval.mjs','llm.mjs','seed.mjs','sources.mjs','sync.mjs','notion-sync.mjs','evidence.mjs','answer-export.mjs','export-layout.mjs','export-blocks.mjs']
componentTitles.coordination='دستیار هماهنگی و برنامه ریزی'
publicFiles.coordination=['coordination-rules.mjs','coordination-operations.js','coordination.html','coordination-shell.mjs','coordination-shell.css','coordination-embedded.css','coordination-enhancements.js','coordination-followups-ui.js','coordination-icon.svg']
componentTitles.contracts='مقایسه‌گر قرارداد'
publicFiles.contracts=['contracts.html','contracts.css','contracts-refresh.css','contracts-diff.mjs','contracts-state.mjs','contracts-ui.mjs','contracts-workbench.mjs','contracts-workbench.css','contracts-review-groups.mjs','contracts-icon.svg']
componentTitles.marketing='سامانه بازاریابی'
publicFiles.marketing=['marketing.html','marketing-shell.mjs','marketing-shell.css']
componentTitles.support='دستیار مدیر پشتیبانی'
publicFiles.support=['support-crm-links.mjs','support-account.mjs','support.html','support.css','support-ui.mjs','support-icon.svg']
componentTitles.projectcontrol='دستیار مدیران پروژه'
publicFiles.projectcontrol=['projectcontrol-icon.svg','projectcontrol.html','projectcontrol-ui.mjs','projectcontrol-view.mjs','projectcontrol-roadmap.mjs','projectcontrol.css']
componentTitles.supportsales='محاسبه‌گر فروش پشتیبانی'
publicFiles.supportsales=['supportsales-registration.mjs','supportsales-workflow.css','supportsales-icon.svg','supportsales.html','supportsales-shell.mjs','supportsales-shell.css','supportsales-embedded.css','supportsales-proposal-import.js','supportsales-calculator.js','supportsales-engine.mjs']
componentTitles.deploymentplan='برنامه ریزی پروژه های استقرار'
publicFiles.deploymentplan=['deploymentplan.html','deploymentplan-ui.mjs','deploymentplan-view.mjs','deploymentplan.css','deploymentplan-icon.svg']
export function componentOwner(file){
 if(/^development-[a-z-]+\.mjs$/.test(file)||file==='public/development.html'||/^public\/development(?:-[a-z-]+\.[a-z]+|\.css)$/.test(file)||(file.startsWith('deployment/development-')&&file.endsWith('.mjs'))||file.startsWith('tools/development/'))return 'development'
 const extension=installedExtensions.find(item=>extensionFile(item.id,file));if(extension)return extension.id
 if(/^deploymentplan-[a-z-]+\.mjs$/.test(file)||file.startsWith('tools/deploymentplan/'))return 'deploymentplan'
 if(/^supportsales-[a-z-]+\.mjs$/.test(file)||file.startsWith('tools/supportsales/'))return 'supportsales'
 if(/^projectcontrol-[a-z-]+\.mjs$/.test(file)||file.startsWith('tools/projectcontrol/'))return 'projectcontrol'
 if(/^support-[a-z-]+\.(mjs|json)$/.test(file)||file.startsWith('tools/support/'))return 'support'
 if(/^presentation-[a-z-]+\.mjs$/.test(file)||/^public\/presentation(?:\.[a-z]+|-[a-z-]+\.[a-z]+)$/.test(file)||file.startsWith('tools/presentation/'))return 'presentation'
 if(/^marketing-[a-z-]+\.(mjs|json)$/.test(file)||file.startsWith('tools/marketing/'))return 'marketing'
 if(file==='coordination-access.mjs')return null // Used by the shared organization-account grant check.
 if(/^coordination-[a-z-]+\.mjs$/.test(file)||file.startsWith('tools/coordination/'))return 'coordination'
 if(/^contracts-[a-z-]+\.mjs$/.test(file)||file.startsWith('tools/contracts/'))return 'contracts'
 if(['market-access.mjs','pricing-access.mjs','dashboard-access.mjs','history.mjs'].includes(file))return null // Used by shared authentication / DPAPI.
 for(const id of Object.keys(componentTitles))if((publicFiles[id]||[]).some(name=>file==='public/'+name))return id
 if(/^(?:public\/)?reports-[a-z-]+\.mjs$/.test(file))return 'reports'
 if(file==='tariff-http.mjs'||file.startsWith('tools/tariff/'))return 'tariff'
 if(file==='home.mjs')return 'home'
 if(chatModules.includes(file))return 'chat'
 if(/^market-[a-z-]+\.(?:mjs|json)$/.test(file)||file.startsWith('tools/market/'))return 'market'
 if(/^pricing-[a-z-]+\.mjs$/.test(file)||file.startsWith('tools/pricing/'))return 'pricing'
 if(/^dashboard-[a-z-]+\.mjs$/.test(file)||file.startsWith('tools/crm-dashboard/'))return 'crm'
 return null
}
componentTitles.presentation='طراحی پرزنت دمو'
publicFiles.presentation=['presentation.html','presentation-ui.mjs','presentation-catalog.mjs','presentation-icon.svg','presentation.css']
componentTitles.development='میزکار توسعه و انتشار'
for(const extension of installedExtensions)componentTitles[extension.id]=extension.title
