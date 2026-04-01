use std::fs::{self, OpenOptions};
use std::io::Write;
use std::time::Duration;
use tauri::Manager;

// ─── Logging ────────────────────────────────────────────────────────────────

/// Retorna o diretório de logs: %APPDATA%/pdv-comercialia/logs/
#[tauri::command]
fn get_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("logs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// Acrescenta uma linha ao arquivo de log. Cria o arquivo se não existir.
#[tauri::command]
fn append_log_line(
    app: tauri::AppHandle,
    filename: String,
    line: String,
) -> Result<(), String> {
    let logs_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("logs");
    fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;
    let path = logs_dir.join(&filename);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", line).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Lançamento via frontend ────────────────────────────────────────────────

/// Retorna os argumentos da linha de comando passados ao PDV.
/// O frontend principal passa: --auth-token=<jwt> --estabelecimento=<id> --licenca=<chave>
#[tauri::command]
fn get_launch_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}

// ─── Serial / ESC·POS / Gaveta / Balança ────────────────────────────────────

/// Lista as portas seriais disponíveis no sistema (ex: "COM3", "/dev/ttyUSB0").
#[tauri::command]
fn list_serial_ports() -> Vec<String> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.port_name)
        .collect()
}

/// Envia bytes ESC/POS para a porta serial indicada.
/// `data` é um array de bytes (números 0–255).
/// Usado para imprimir recibos de venda e comprovantes de sangria.
#[tauri::command]
fn print_escpos(port_name: String, baud_rate: u32, data: Vec<u8>) -> Result<(), String> {
    let mut port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(3000))
        .open()
        .map_err(|e| format!("Erro ao abrir porta {}: {}", port_name, e))?;
    port.write_all(&data)
        .map_err(|e| format!("Erro ao enviar dados ESC/POS: {}", e))?;
    Ok(())
}

/// Abre a gaveta de dinheiro enviando o comando ESC/POS `ESC p 0 25 250` pela mesma
/// porta serial da impressora.
#[tauri::command]
fn open_cash_drawer(port_name: String, baud_rate: u32) -> Result<(), String> {
    // ESC p <pin> <on_time> <off_time> — abre gaveta conectada ao conector RJ11 da impressora
    let cmd: Vec<u8> = vec![0x1B, 0x70, 0x00, 0x19, 0xFA];
    print_escpos(port_name, baud_rate, cmd)
}

/// Lê uma linha da balança (protocolo RS-232 simples: balança envia ASCII terminado em \n ou \r\n).
/// Retorna a string lida (ex: "  1.250 kg").
/// Timeout: 2 segundos.
#[tauri::command]
fn read_scale_once(port_name: String, baud_rate: u32) -> Result<String, String> {
    let mut port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(2000))
        .open()
        .map_err(|e| format!("Erro ao abrir porta balança {}: {}", port_name, e))?;

    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match port.read(&mut byte) {
            Ok(0) => break,
            Ok(_) => {
                if byte[0] == b'\n' {
                    break;
                }
                if byte[0] != b'\r' {
                    buf.push(byte[0]);
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => break,
            Err(e) => return Err(format!("Erro de leitura da balança: {}", e)),
        }
    }

    String::from_utf8(buf).map_err(|e| format!("Encoding inválido da balança: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_log_dir,
            append_log_line,
            get_launch_args,
            list_serial_ports,
            print_escpos,
            open_cash_drawer,
            read_scale_once,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


/// Retorna o diretório de logs: %APPDATA%/pdv-comercialia/logs/
#[tauri::command]
fn get_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("logs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// Acrescenta uma linha ao arquivo de log. Cria o arquivo se não existir.
#[tauri::command]
fn append_log_line(
    app: tauri::AppHandle,
    filename: String,
    line: String,
) -> Result<(), String> {
    let logs_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("logs");
    fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;
    let path = logs_dir.join(&filename);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", line).map_err(|e| e.to_string())?;
    Ok(())
}

/// Retorna os argumentos da linha de comando passados ao PDV.
/// O frontend principal passa: --auth-token=<jwt> --estabelecimento=<id> --licenca=<chave>
#[tauri::command]
fn get_launch_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_log_dir,
            append_log_line,
            get_launch_args,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
