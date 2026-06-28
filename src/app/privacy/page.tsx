import { PageHeading } from "@/components/page-heading";

export default function PrivacyPage() {
  return <>
    <PageHeading eyebrow="PRIVACIDAD Y PROTECCIÓN DE DATOS" title="Política de privacidad · vAMSYS Pilot API" copy="Información sobre el tratamiento de datos cuando un piloto conecta voluntariamente su cuenta de vAMSYS con HISPAFLY AOC." />
    <article className="card legal-copy">
      <p><strong>Última actualización:</strong> 29 de junio de 2026.</p>

      <h2>1. Responsable y alcance</h2>
      <p>HISPAFLY Virtual Airline es responsable del tratamiento realizado por el portal HISPAFLY AOC. Esta política se aplica exclusivamente a la conexión voluntaria de una cuenta de piloto de vAMSYS mediante OAuth Authorization Code + PKCE.</p>

      <h2>2. Datos tratados</h2>
      <p>Con el consentimiento del piloto podemos recibir desde vAMSYS: identificadores de usuario y piloto, nombre de usuario, nombre y apellidos, correo electrónico, indicativo, rango, hub y los identificadores VATSIM, IVAO o Discord que formen parte del perfil autorizado.</p>
      <p>Los tokens de acceso y renovación OAuth se almacenan exclusivamente en el servidor. No se muestran en la interfaz ni se entregan al navegador.</p>

      <h2>3. Finalidades</h2>
      <ul>
        <li>Vincular de forma verificable el perfil local de HISPAFLY con la cuenta vAMSYS autorizada por el piloto.</li>
        <li>Importar y mantener actualizados los datos básicos del perfil del piloto.</li>
        <li>Preparar el acceso de solo lectura a vuelos y PIREPs aceptados para funciones AOC futuras.</li>
        <li>Proteger la seguridad, trazabilidad y auditoría de la conexión.</li>
      </ul>
      <p>HISPAFLY AOC no sustituye PEGASUS ACARS ni vAMSYS, no acepta PIREPs y no utiliza esta conexión para funciones EFB.</p>

      <h2>4. Base y consentimiento</h2>
      <p>La conexión se basa en el consentimiento explícito otorgado por el piloto en la pantalla de autorización de vAMSYS. El piloto puede rechazar la autorización o solicitar la desconexión en cualquier momento.</p>

      <h2>5. Conservación y revocación</h2>
      <p>Los datos de perfil y tokens se conservan mientras la conexión sea necesaria para la participación del piloto en HISPAFLY. Cuando vAMSYS revoque el permiso o el piloto solicite la desconexión, el token se marcará como revocado y dejará de utilizarse. Los registros mínimos de auditoría pueden conservarse para seguridad y trazabilidad.</p>

      <h2>6. Destinatarios y alojamiento</h2>
      <p>Los datos no se venden. Se procesan únicamente por HISPAFLY y por los proveedores técnicos necesarios para alojar el portal y la base de datos, actualmente Vercel y Neon. vAMSYS actúa como origen de los datos autorizados por el piloto.</p>

      <h2>7. Seguridad</h2>
      <p>La conexión utiliza PKCE, estado anti-CSRF, cookies temporales HTTP-only y solicitudes de token realizadas únicamente desde el servidor. No se utiliza client secret para el Pilot API.</p>

      <h2>8. Derechos y contacto</h2>
      <p>El piloto puede solicitar acceso, corrección, desconexión o eliminación de sus datos mediante los canales oficiales de administración de HISPAFLY Virtual Airline. También puede revocar el acceso directamente desde su cuenta de vAMSYS cuando dicha opción esté disponible.</p>

      <h2>9. Cambios</h2>
      <p>Esta política podrá actualizarse cuando cambien las funciones de integración. Cualquier ampliación sustancial del uso de datos requerirá la revisión de los permisos y, cuando corresponda, un nuevo consentimiento.</p>
    </article>
  </>;
}
