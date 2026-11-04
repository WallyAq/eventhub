const assetPathPrefix = "https://www.figma.com/api/mcp/asset/778bd703-14fc-4b33-ac21-d99d415f7ab5";
const imgContainer = `${assetPathPrefix}/79090.svg`;
const imgImage = `${assetPathPrefix}/401ce.svg`;

export default function CadastrarProfessor() {
  return (
    <div className="backdrop-blur-[4px] bg-[rgba(41,48,64,0.4)] content-stretch flex items-center justify-center p-[24px] relative size-full" data-node-id="2053:2773" data-name="Cadastrar_Professor">
      <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex flex-[1_0_0] flex-col items-start max-h-[942px] max-w-[672px] min-w-px overflow-clip p-px relative rounded-[8px] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]" data-node-id="2053:2774" data-name="Modal Container">
        <div className="bg-[#f9f9ff] border-[rgba(199,196,216,0.8)] border-b border-solid relative shrink-0 w-full" data-node-id="2053:2775" data-name="Cabeçalho do Modal">
          <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start justify-between pb-[21px] pt-[20px] px-[24px] relative size-full">
            <div className="relative shrink-0" data-node-id="2053:2776" data-name="Container">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[5.065px] items-start relative size-full">
                <div className="content-stretch flex items-center relative shrink-0 w-full" data-node-id="2053:2777" data-name="Container">
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2053:2780" data-name="Heading 2">
                    <div className="[word-break:break-word] flex flex-col font-['Inter:Semi_Bold'] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[20px] tracking-[-0.1px] whitespace-nowrap" data-node-id="2053:2781">
                      <p className="leading-[28px]">Cadastrar Professor/Palestrante</p>
                    </div>
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-start max-w-[512px] relative shrink-0 w-full" data-node-id="2053:2782" data-name="Container">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[13px] whitespace-nowrap" data-node-id="2053:2783">
                    <p className="leading-[21.13px] mb-0">Homologue palestrantes e docentes para vinculá-los às atividades, workshops e</p>
                    <p className="leading-[21.13px]">emissão de certificados.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative rounded-[4px] shrink-0" data-node-id="2053:2784" data-name="Button - Fechar modal">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center pb-[9px] pt-[6px] px-[6px] relative size-full">
                <div className="relative shrink-0 size-[11.667px]" data-node-id="2053:2785" data-name="Container">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="h-[371px] relative shrink-0 w-full" data-node-id="2053:2787" data-name="Corpo do Formulário com Scroll Suave">
          <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[10px] items-start overflow-auto px-[24px] relative rounded-[inherit] size-full">
            <div className="content-stretch flex flex-col items-start relative shrink-0 w-[622px]" data-node-id="2053:2788" data-name="Campo 1: Foto / Avatar do docente (Upload estilizado 1:1)">
              <div className="h-[20px] relative shrink-0 w-full" data-node-id="2053:2789" data-name="Label" />
            </div>
            <div className="content-stretch flex gap-[16px] items-start justify-center relative shrink-0 w-[622px]" data-node-id="2053:2790" data-name="Grid 2 Colunas: Nome Completo & Titulação Acadêmica">
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[6px] items-start min-w-px relative" data-node-id="2053:2791" data-name="Campo 2: Nome Completo">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2792" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2793">
                    <p>
                      <span className="leading-[20px]">Nome Completo</span>
                      <span className="leading-[20px] text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip pb-[14px] pt-[13px] px-[15px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2794" data-name="Input">
                  <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2795" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-clip relative rounded-[inherit] size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#777587] text-[15px] w-full" data-node-id="2053:2796">
                        <p className="leading-[normal]">Ex: Dra. Helena Duarte</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[6px] items-start min-w-px relative" data-node-id="2053:2797" data-name="Campo 3: Titulação / Cargo Acadêmico">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2798" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2799">
                    <p>
                      <span className="leading-[20px]">Titulação/Cargo Acadêmico</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2800" data-name="Container">
                  <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-center justify-center px-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2801" data-name="Options">
                    <div className="absolute inset-[-1px]" data-node-id="2053:2802" data-name="image clip">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center overflow-clip pl-[271.5px] pr-[9px] py-[11.75px] relative rounded-[inherit] size-full">
                        <div className="relative shrink-0 size-[22.5px]" data-node-id="2053:2803" data-name="image">
                          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgImage} />
                        </div>
                      </div>
                    </div>
                    <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2805" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-full" data-node-id="2053:2806">
                          <p className="leading-[24px]">Selecione a titulação...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-[19.57%] right-[12px] top-[19.57%] w-[10px]" data-node-id="2053:2807" data-name="Container" />
                </div>
              </div>
            </div>
            <div className="content-stretch flex gap-[16px] items-start justify-center relative shrink-0 w-[622px]" data-node-id="2053:2808" data-name="Grid 2 Colunas: Instituição & E-mail">
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[6px] items-start min-w-px pb-[28px] relative" data-node-id="2053:2809" data-name="Campo 4: Instituição de Origem / Afiliação">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2810" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2811">
                    <p>
                      <span className="leading-[20px]">Instituição de Origem/Afiliação</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-center justify-center relative shrink-0 w-full" data-node-id="2053:2812" data-name="Container">
                  <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip pb-[14px] pt-[13px] px-[15px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2813" data-name="Input">
                    <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2814" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-clip relative rounded-[inherit] size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#777587] text-[15px] w-full" data-node-id="2053:2815">
                          <p className="leading-[normal]">Ex: MIT Quantum Lab, USP, INPE</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px relative" data-node-id="2053:2818" data-name="Campo 5: E-mail Institucional">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2819" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2820">
                    <p>
                      <span className="leading-[20px]">E-mail Institucional ou de Contato</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-start pt-[2px] relative shrink-0 w-full" data-node-id="2053:2821" data-name="Container">
                  <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip pb-[14px] pt-[13px] px-[15px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2822" data-name="Input">
                    <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2823" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-clip relative rounded-[inherit] size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#777587] text-[15px] w-full" data-node-id="2053:2824">
                          <p className="leading-[normal]">docente@universidade.edu.br</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-[24px] relative shrink-0 w-full" data-node-id="2053:2827" data-name="Container" />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-[6px] items-start pb-[7px] relative shrink-0 w-[622px]" data-node-id="2053:2828" data-name="Campo 6: Mini-biografia / Apresentação (Resumo até 400 caracteres com contador)">
              <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-node-id="2053:2829" data-name="Container">
                <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2053:2830" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] whitespace-nowrap" data-node-id="2053:2831">
                    <p className="leading-[20px]">Mini-biografia/Apresentação</p>
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2053:2832" data-name="Container">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#777587] text-[12px] tracking-[0.24px] whitespace-nowrap" data-node-id="2053:2833">
                    <p className="leading-[16px]">0 / 400</p>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-auto pb-[35px] pt-[11px] px-[15px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2834" data-name="Textarea">
                <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2835" data-name="Container">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#777587] text-[15px] w-full whitespace-pre-wrap" data-node-id="2053:2836">
                      <p className="leading-[24px] mb-0">{`Resumo curricular para divulgação na programação do evento e aplicativo oficial `}</p>
                      <p className="leading-[24px]">dos congressistas...</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-[#f9f9ff] border-[rgba(199,196,216,0.8)] border-solid border-t relative shrink-0 w-full" data-node-id="2053:2837" data-name="Rodapé com Botões de Ação do Modal">
          <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12px] items-center justify-end pb-[16px] pt-[17px] px-[24px] relative size-full">
            <div className="bg-white border border-[#c7c4d8] border-solid relative rounded-[4px] shrink-0 w-[120px]" data-node-id="2053:2838" data-name="Button">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center px-[21px] py-[11px] relative size-full">
                <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] text-center whitespace-nowrap" data-node-id="2053:2839">
                  <p className="leading-[20px]">Cancelar</p>
                </div>
              </div>
            </div>
            <div className="bg-[#4f46e5] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] relative rounded-[4px] shrink-0 w-[120px]" data-node-id="2053:2840" data-name="Button">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center px-[24px] py-[10px] relative size-full">
                <div className="content-stretch flex flex-col items-center relative shrink-0" data-node-id="2053:2841" data-name="Container">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-center text-white whitespace-nowrap" data-node-id="2053:2842">
                    <p className="leading-[20px]">{`Salvar `}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
SUPER CRITICAL: The generated React+Tailwind code MUST be converted to match the target project's technology stack and styling system.
1. Analyze the target codebase to identify: technology stack, styling approach, component patterns, and design tokens
2. Convert React syntax to the target framework/library
3. Transform all Tailwind classes to the target styling system while preserving exact visual design
4. Follow the project's existing patterns and conventions
DO NOT install any Tailwind as a dependency unless the user instructs you to do so.

Node ids have been added to the code as data attributes, e.g. `data-node-id="1:2"`.
The generated code contains image and SVG URL constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These URLs are temporary download sources and expire after 7 days. Download each asset into the project with curl -L, then replace its URL in the generated code with a reference to the downloaded asset. Never use the temporary URLs as runtime image sources.
