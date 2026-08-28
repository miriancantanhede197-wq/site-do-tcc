const Commands = {

    reconhecimento: null,


    iniciar() {

        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;


        if (!SpeechRecognition) {

            Speech.falar(
                "Reconhecimento de voz não disponível neste navegador."
            );

            return;

        }


        this.reconhecimento =
            new SpeechRecognition();


        this.reconhecimento.lang =
            "pt-BR";


        this.reconhecimento.continuous =
            false;


        this.reconhecimento.interimResults =
            false;


        this.reconhecimento.onstart =
            () => {

                document
                    .getElementById(
                        "status"
                    )
                    .textContent =
                    "Estou ouvindo...";

            };


        this.reconhecimento.onresult =
            evento => {

                const texto =
                    evento
                        .results[0][0]
                        .transcript
                        .toLowerCase();


                console.log(
                    "Comando:",
                    texto
                );


                this.processar(
                    texto
                );

            };


        this.reconhecimento.onerror =
            erro => {

                console.error(
                    erro
                );

            };


        this.reconhecimento.start();

    },


    processar(comando) {

        if (
            comando.includes(
                "o que tem"
            )
            ||
            comando.includes(
                "na minha frente"
            )
        ) {

            this.informarAmbiente();

            return;

        }


        if (
            comando.includes(
                "ativar"
            )
        ) {

            App.ativar();

            return;

        }


        if (
            comando.includes(
                "desativar"
            )
        ) {

            App.desativar();

            return;

        }


        Speech.falar(
            "Não entendi o comando."
        );

    },


    informarAmbiente() {

        if (
            !Detector.model
        ) {

            Speech.falar(
                "A inteligência artificial ainda não está pronta."
            );

            return;

        }


        Detector.model
            .detect(
                Camera.video
            )
            .then(
                resultados => {

                    if (
                        !resultados.length
                    ) {

                        Speech.falar(
                            "Não encontrei objetos à frente."
                        );

                        return;

                    }


                    const objetos =
                        resultados
                            .slice(0, 4)
                            .map(
                                objeto =>
                                    objeto.class
                            );


                    Speech.falar(

                        "Estou vendo " +
                        objetos.join(
                            ", "
                        )

                    );

                }
            );

    }

};