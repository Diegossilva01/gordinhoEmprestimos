# Gordinho Empréstimos — site no Git + Google Planilhas

O login abre no seu site. Não há tela de login hospedada no Google. O Google Apps Script recebe as solicitações, valida a senha e grava os dados. As abas e a planilha são criadas por `configurarSistema()`.

## 1. Preparar o Google Script

1. Entre em https://script.google.com e crie um projeto.
2. Substitua o conteúdo do arquivo Code.gs pelo arquivo `google-script/Code.gs` deste pacote.
3. Crie outro arquivo de script chamado `Core` e cole o conteúdo de `google-script/Core.gs`.
4. Em **Configurações do projeto → Propriedades do script**, adicione:
   - `ADMIN_USUARIO`: o usuário que você quer usar para entrar.
   - `ADMIN_SENHA_INICIAL`: uma senha sua com pelo menos 12 caracteres.
5. Execute **configurarSistema** pelo editor e autorize. O registro de execução mostra o link da planilha criada.
6. A senha inicial será removida das propriedades após a configuração. A senha não fica no código nem nos arquivos públicos do Git.
7. Opcional: para usar uma planilha que já existe, adicione antes da configuração a propriedade `SPREADSHEET_ID` com o ID dela. Use uma planilha exclusiva deste sistema.
8. Clique em **Implantar → Nova implantação → Aplicativo da Web**. Configure **Executar como: você** e **Quem tem acesso: qualquer pessoa**. Copie a URL que termina em `/exec`.

O endpoint precisa aceitar as chamadas do site. Isso não dá acesso aos registros sem a sessão de login. Mantenha a planilha sem compartilhamento público. Depois de alterações no Google Script, edite a implantação, selecione **Nova versão** e implante novamente.

## 2. Colocar no Git

Envie estes arquivos para a raiz do repositório:

- `index.html`
- `style.css`
- `app.js`
- `core.js`
- `config.js`
- `favicon.svg`
- `logo-gordinho.png`
- `skin.css`
- `screens.js`
- `cotacao.html`
- `quote.js`

No `config.js`, substitua `COLE_A_URL_DO_GOOGLE_SCRIPT_AQUI` pela URL `/exec`. Apenas essa URL é pública; não coloque senha, token, ID de sessão ou propriedades do script nesse arquivo.

O repositório precisa estar publicado como site. Para GitHub Pages: **Settings → Pages → Deploy from a branch → main → / (root) → Save**. Se você já usa outro serviço ligado ao Git, os mesmos arquivos podem ser publicados nele. Abra o site publicado e entre com o usuário e a senha definidos nas propriedades.

## O que está incluído

- Login no próprio site e saída da conta; senha validada pelo servidor.
- Sessão de até oito horas, preservada ao atualizar a página na mesma aba.
- Alteração de senha, encerrando as sessões anteriores.
- Cadastro e edição de clientes: nome, telefone, documento, endereço e observações.
- Empréstimos com valor, taxa, data de liberação, vencimento e condições.
- Pagamento único ou parcelas diárias, semanais, quinzenais e mensais.
- Simulação do total e das parcelas antes de cadastrar.
- Recebimentos totais ou parciais com data, valor, forma e observação.
- Parcelas vencidas, saldo, dias de atraso e situação automática.
- Histórico, estorno com motivo e resumo para impressão.
- Encerramento com baixa e opção de reabrir um empréstimo.
- Despesas, lucro recebido, lucro previsto, prejuízo e resultado líquido.
- Busca, filtros, exportação dos pagamentos em CSV e layout para celular.

## Regras de cálculo

Os juros são **simples e fixos por contrato**, aplicados uma única vez. Exemplo: R$ 1.000 a 10% gera R$ 100 de juros e R$ 1.100 a receber. Dividir em cinco parcelas gera cinco pagamentos de R$ 220. A taxa não é uma taxa mensal e não se repete automaticamente.

Pagamentos abatem primeiro as parcelas mais antigas e, para o resultado financeiro, primeiro o capital. No exemplo acima, os primeiros R$ 1.000 recebidos são capital recuperado. Os R$ 100 seguintes são lucro recebido. Valor pago não pode ultrapassar o saldo. Não há capitalização, multa ou juros extras automáticos por atraso.

O último centavo de arredondamento fica na última parcela. Parcelas mensais preservam o dia do primeiro vencimento quando possível: começando em 31/01, fevereiro vence no último dia do mês e março volta a 31/03.

**Atrasado** significa parcela ainda aberta com vencimento anterior à data atual de São Paulo. No dia do vencimento ela ainda não é considerada atrasada.

**Prejuízo** só aparece quando você registra uma baixa. É o capital ainda não recuperado. Juros não recebidos são baixados, mas não viram prejuízo em capital. O resultado líquido acumulado é lucro recebido menos capital perdido menos despesas. Ele não representa saldo de caixa.

## Abas da planilha

`Clientes`, `Emprestimos`, `Pagamentos`, `Despesas`.

Os valores financeiros são armazenados como **centavos inteiros**: 100000 representa R$ 1.000. A coluna `rate` guarda o percentual digitado, como 10. As parcelas ficam em JSON na coluna `schedule`. Esse formato evita diferenças de arredondamento; o site mostra tudo em reais. Use o site para registrar e corrigir dados. Não renomeie abas ou cabeçalhos nem edite IDs e cronogramas manualmente.

## Recuperar a senha

Se esquecer, defina `ADMIN_SENHA_INICIAL` novamente nas propriedades. No editor, crie temporariamente e execute esta função:

```javascript
function redefinirMinhaSenha() {
  const p = PropertiesService.getScriptProperties();
  const senha = p.getProperty('ADMIN_SENHA_INICIAL');
  if (!senha || senha.length < 12) throw new Error('Informe uma senha com 12 caracteres ou mais.');
  p.setProperty('PASSWORD_HASH', passwordHash_(senha));
  p.deleteProperty('ADMIN_SENHA_INICIAL');
  p.deleteProperty('LOGIN_ATTEMPTS');
  clearSessions_();
}
```

Remova a função temporária após executar. Não exponha essa operação no site.

## Se não conectar

Confira que a URL termina em `/exec`, que a implantação executa como você, permite **qualquer pessoa**, está na versão mais recente e que `configurarSistema` foi executada. Abra a URL `/exec` em uma janela anônima: ela deve retornar o nome do serviço, sem pedir login Google e sem mostrar registros. O aplicativo usa POST em texto simples e segue o redirecionamento do Google. Nunca use `no-cors`: isso impediria ler a resposta e confirmar o salvamento.

## Validação e limites desta entrega

Os testes locais verificam os cálculos, arredondamentos, datas, pagamentos, autenticação, autorização, estorno e repetição de solicitações. A conexão com sua conta Google e seu domínio só poderá ser verificada depois da configuração e implantação. Nenhuma planilha foi criada na sua conta durante esta entrega; o código fará isso ao executar a função de configuração.

Esta versão tem uma única conta administrativa. Não há envios automáticos de mensagens, cobrança recorrente de juros nem conexão com banco. O Google Script usa bloqueio de escrita e identificadores de operação para evitar duplicação ao repetir a mesma solicitação de empréstimo, pagamento ou despesa. Se uma conexão cair durante um salvamento, atualize e confira o histórico antes de fazer um novo lançamento.

Google Planilhas não oferece transações completas de banco de dados. Não altere a planilha enquanto o site estiver gravando dados. Para grande volume de registros, a leitura integral das quatro abas precisará evoluir para consultas paginadas. As quotas do Google Apps Script também se aplicam.

Referências de implementação: https://developers.google.com/apps-script/guides/web e https://developers.google.com/apps-script/guides/content.


## Nova interface e página do cliente

Menu lateral escuro, tema claro/escuro, dashboard ampliado, simulador, caixa com movimentos automáticos e relatórios por período. A troca de senha está em Configurações. Os arquivos do Google Script e a planilha permanecem os mesmos nesta atualização.

`cotacao.html` é uma calculadora pública acessível pelo link Sou cliente na tela de login. A taxa começa em 10% apenas como cenário ilustrativo e é editável pelo visitante. Ela não publica uma taxa oficial, não aprova crédito, não coleta dados e não grava empréstimos. A taxa comercial efetiva ainda precisa ser definida por você.

O controle de caixa soma pagamentos válidos e desconta liberações de empréstimos e despesas, a partir de zero. Não inclui aportes nem saldo bancário anterior. A versão continua com uma conta administrativa e juros simples fixos por contrato; crédito rotativo e renegociação automática não estão incluídos.
